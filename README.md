# dsh-repo-brief

给 Agent 装一个 `repo_brief` 工具：**一次调用摸清一个陌生仓库**，替代十几次探索调用。

## 一次调用返回什么

- 语言构成（按扩展名计数）
- `package.json` 的脚本、依赖、devDependencies
- 可能的入口文件（含 DSH 插件的 `src/host.ts` / `src/client.tsx`）
- 测试命令（`scripts.test`、pytest、go test、cargo test 等）
- 最近修改的 8 个文件、最大的 5 个文件
- 顶层目录

输出是给模型看的 Markdown，默认截断到 6000 字符。

## 为什么是工具，而不是又一个面板

Agent 进新仓库时的固定动作是：`ls` → 读 package.json → 猜入口 → 找测试命令 → 看改动。每一步都是一次模型往返。把这些合并成**一次确定性调用**，省的是往返次数和上下文，而不是再加一块 UI。

## 权限

只读：`readdir` / `stat` / `readFile`。不写文件、不执行命令、不联网。Host-only bundle，没有浏览器半。

## 装

```bash
pnpm install
pnpm run build
```

然后 `plugin_manager install_bundle` 指向本目录。

工具参数：

| 参数 | 说明 |
|---|---|
| `path` | 仓库绝对路径，默认当前工作目录 |
| `depth` | 扫描深度 1–6，默认 4 |

## 开发

```bash
pnpm run check   # tsc -p tsconfig.json
pnpm run build   # src/host.ts -> dist/index.js
```
