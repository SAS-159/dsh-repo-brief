/**
 * repo_brief — map a repository in one tool call.
 *
 * An unfamiliar repository normally costs an agent a dozen exploratory calls:
 * list the root, read package.json, guess entry points, find the test command,
 * check what changed recently. This tool answers all of it from one bounded
 * walk and returns Markdown sized for a model's context.
 *
 * Read-only: it stats and reads, never writes, never runs commands, never
 * touches the network.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.idea',
  '.vscode',
  'vendor',
])

const ENTRY_CANDIDATES = [
  'src/index.ts',
  'src/index.tsx',
  'src/main.ts',
  'src/main.tsx',
  'src/host.ts',
  'src/client.tsx',
  'src/host.js',
  'src/client.js',
  'src/server.ts',
  'server.js',
  'src/App.tsx',
  'index.js',
  'index.ts',
  'main.py',
  'app.py',
  'manage.py',
  'main.go',
  'cmd/main.go',
  'src/main.rs',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'Makefile',
]

const MAX_ENTRIES = 4000
const MAX_CHARS = 6000

interface FileEntry {
  rel: string
  size: number
  mtime: number
  ext: string
}

interface WalkResult {
  files: FileEntry[]
  truncated: boolean
}

async function walk(root: string, depth: number, signal: AbortSignal | undefined): Promise<WalkResult> {
  const files: FileEntry[] = []
  const queue: Array<{ dir: string; level: number }> = [{ dir: root, level: 0 }]
  let seen = 0
  let truncated = false

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    let entries
    try {
      entries = await readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (signal?.aborted === true) throw new Error('repo_brief: aborted')
      seen += 1
      if (seen > MAX_ENTRIES) {
        truncated = true
        break
      }
      const full = join(current.dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
        if (current.level + 1 <= depth) queue.push({ dir: full, level: current.level + 1 })
        continue
      }
      if (!entry.isFile()) continue
      try {
        const info = await stat(full)
        files.push({
          rel: full.slice(root.length + 1).split(sep).join('/'),
          size: info.size,
          mtime: info.mtimeMs,
          ext: extname(entry.name).toLowerCase(),
        })
      } catch {
        /* unreadable entry */
      }
    }
    if (truncated) break
  }

  return { files, truncated }
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function languages(files: readonly FileEntry[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const file of files) {
    const key = file.ext === '' ? '(none)' : file.ext
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)
}

function detectTestCommand(pkg: Record<string, unknown> | undefined, has: (path: string) => boolean): string | undefined {
  const scripts = pkg?.scripts as Record<string, string> | undefined
  if (scripts?.test !== undefined) return `npm test  (scripts.test: ${scripts.test})`
  if (has('go.mod')) return 'go test ./...'
  if (has('Cargo.toml')) return 'cargo test'
  if (has('pyproject.toml') || has('requirements.txt')) return 'pytest'
  if (has('pom.xml')) return 'mvn test'
  if (has('build.gradle')) return 'gradle test'
  return undefined
}

async function buildBrief(inputPath: string, depth: number, signal: AbortSignal | undefined): Promise<string> {
  const root = inputPath
  const { files, truncated } = await walk(root, depth, signal)
  const has = (path: string): boolean => files.some((file) => file.rel === path)
  const pkg = has('package.json') ? await readJson(join(root, 'package.json')) : undefined

  const lines: string[] = []
  lines.push(`# Repository brief: ${root}`)
  lines.push('')
  lines.push(`Scanned ${files.length} files up to depth ${depth}${truncated ? ' (truncated — large tree)' : ''}.`)

  const langs = languages(files)
  if (langs.length > 0) {
    lines.push('')
    lines.push('## Languages')
    lines.push(langs.map(([ext, count]) => `${ext} × ${count}`).join(' · '))
  }

  if (pkg !== undefined) {
    lines.push('')
    lines.push('## package.json')
    const name = typeof pkg.name === 'string' ? pkg.name : '(unnamed)'
    const version = typeof pkg.version === 'string' ? pkg.version : ''
    lines.push(`${name}${version === '' ? '' : ` ${version}`}`)
    const scripts = pkg.scripts as Record<string, string> | undefined
    if (scripts !== undefined) {
      const entries = Object.entries(scripts).slice(0, 12)
      lines.push('scripts: ' + entries.map(([key, value]) => `${key}=${value}`).join(' | '))
    }
    const deps = pkg.dependencies as Record<string, string> | undefined
    if (deps !== undefined) {
      const names = Object.keys(deps)
      lines.push(`dependencies (${names.length}): ${names.slice(0, 15).join(', ')}${names.length > 15 ? ' …' : ''}`)
    }
    const dev = pkg.devDependencies as Record<string, string> | undefined
    if (dev !== undefined) {
      const names = Object.keys(dev)
      lines.push(`devDependencies (${names.length}): ${names.slice(0, 12).join(', ')}${names.length > 12 ? ' …' : ''}`)
    }
  }

  const entries = ENTRY_CANDIDATES.filter(has)
  if (entries.length > 0) {
    lines.push('')
    lines.push('## Likely entry points')
    for (const entry of entries.slice(0, 10)) lines.push(`- ${entry}`)
  }

  const test = detectTestCommand(pkg, has)
  if (test !== undefined) {
    lines.push('')
    lines.push(`## Test: ${test}`)
  }

  const recent = [...files].sort((a, b) => b.mtime - a.mtime).slice(0, 8)
  if (recent.length > 0) {
    lines.push('')
    lines.push('## Recently modified')
    for (const file of recent) lines.push(`- ${file.rel}  (${new Date(file.mtime).toISOString().slice(0, 16).replace('T', ' ')})`)
  }

  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5)
  if (largest.length > 0) {
    lines.push('')
    lines.push('## Largest files')
    for (const file of largest) lines.push(`- ${file.rel}  (${formatBytes(file.size)})`)
  }

  const directories = [...new Set(files.map((file) => file.rel.includes('/') ? file.rel.split('/')[0] : ''))]
    .filter((name) => name !== '')
    .slice(0, 20)
  if (directories.length > 0) {
    lines.push('')
    lines.push('## Top-level directories')
    lines.push(directories.join(' · '))
  }

  const text = lines.join('\n')
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n… (truncated)` : text
}

interface HostContext {
  tools: {
    register(definition: unknown): () => void
  }
}

/** The tool registry is a hard dependency: without it the plugin must not activate. */
export const inject = ['tools']

export function apply(ctx: HostContext): void {
  ctx.tools.register({
    name: 'repo_brief',
    description:
      'Map a repository in one call instead of exploring it step by step. Returns languages, package.json scripts and dependencies, likely entry points, the test command, recently modified files, largest files and top-level directories. Use it first when entering an unfamiliar project or when you need orientation before editing.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path of the repository root. Defaults to the current working directory.',
        },
        depth: {
          type: 'number',
          description: 'Directory depth to scan, 1-6. Defaults to 4.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> => [
        { type: 'text', text: String((value as { text: unknown }).text) },
      ],
    },
    async execute(args: unknown, exec: unknown): Promise<unknown> {
      const input = (args ?? {}) as { path?: unknown; depth?: unknown }
      const root = typeof input.path === 'string' && input.path !== '' ? input.path : process.cwd()
      const requested = typeof input.depth === 'number' ? input.depth : 4
      const depth = Math.max(1, Math.min(6, Math.round(requested)))
      const signal = (exec as { signal?: AbortSignal }).signal
      const text = await buildBrief(root, depth, signal)
      return { text }
    },
  })
}
