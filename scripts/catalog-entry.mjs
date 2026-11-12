/**
 * The catalog entry for awesome-dsh-plugin.
 *
 * Category `dev`: it is a development-time tool that orients an agent in an
 * unfamiliar repository. A hand-written `npm:` key is rejected by their CI.
 */

export function buildEntry(owner, packageName) {
  const description = {
    en: 'Registers a repo_brief tool: one call returns a compact map of a repository — languages, package.json scripts and dependencies, likely entry points, the test command, recently modified and largest files, and top-level directories. Read-only: it stats and reads, never writes or runs commands.',
    zh: '注册 repo_brief 工具：一次调用摸清仓库——语言构成、package.json 脚本与依赖、可能的入口、测试命令、最近修改与最大文件、顶层目录。只读：只做 stat 与读取，不写文件、不执行命令。',
  }
  const lines = [
    `url: https://github.com/${owner}/${packageName}`,
    `name: ${owner}/${packageName}`,
    'category: dev',
    'description:',
    `  en: '${description.en}'`,
    `  zh: '${description.zh}'`,
    `icon: https://raw.githubusercontent.com/${owner}/${packageName}/main/assets/icon-180.png`,
    '',
  ]
  return lines.join('\n')
}

export function buildPullRequestBody(owner, packageName) {
  return [
    `Adds ${owner}/${packageName} to the **Development & Runtime** category.`,
    '',
    '**What it does.** Registers one model-facing tool, `repo_brief`. An unfamiliar repository normally costs a dozen exploratory calls (list the root, read package.json, guess entry points, find the test command, see what changed). This tool answers all of it from one bounded walk and returns Markdown sized for context: languages, scripts and dependencies, likely entry points, test command, recently modified files, largest files, top-level directories.',
    '',
    '**Read-only by construction.** `fs-read` only: it calls `readdir`, `stat` and `readFile`. It never writes, never spawns a process, never touches the network. Host-only bundle — no browser half.',
    '',
    '**Manifest:** `package.json` declares `dsh.bundle.patch` with `cordis.patch.yml` at the root; the plugin declares `inject: ["tools"]` and registers through `ctx.tools.register`. Installable with `dsh plugin --profile web add github:' + owner + '/' + packageName + '`.',
  ].join('\n')
}

export function entryFileName(owner, packageName) {
  return `${owner}__${packageName}.yml`
}
