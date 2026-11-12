/**
 * Build the Host half into dist/index.js (ESM).
 *
 * This bundle is host-only: it registers a tool and ships no browser half.
 */
import { build } from 'esbuild'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const kit = pkg.kit ?? {}
const hostEntry = join(root, kit.entry?.host ?? 'src/host.ts')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

if (!(await exists(hostEntry))) throw new Error(`host entry not found: ${hostEntry}`)

await mkdir(join(root, 'dist'), { recursive: true })

const host = await build({
  entryPoints: [hostEntry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  packages: 'external',
  legalComments: 'none',
  logLevel: 'silent',
})

await writeFile(join(root, 'dist', 'index.js'), host.outputFiles[0].text, 'utf8')

console.log(`built ${pkg.name}`)
console.log(`  dist/index.js  ${Buffer.byteLength(host.outputFiles[0].text)} bytes`)
