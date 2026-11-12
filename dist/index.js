// src/host.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
var SKIP = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "coverage",
  ".cache",
  ".turbo",
  ".idea",
  ".vscode",
  "vendor"
]);
var ENTRY_CANDIDATES = [
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/main.tsx",
  "src/host.ts",
  "src/client.tsx",
  "src/host.js",
  "src/client.js",
  "src/server.ts",
  "server.js",
  "src/App.tsx",
  "index.js",
  "index.ts",
  "main.py",
  "app.py",
  "manage.py",
  "main.go",
  "cmd/main.go",
  "src/main.rs",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "pom.xml",
  "build.gradle",
  "Makefile"
];
var MAX_ENTRIES = 4e3;
var MAX_CHARS = 6e3;
async function walk(root, depth, signal) {
  const files = [];
  const queue = [{ dir: root, level: 0 }];
  let seen = 0;
  let truncated = false;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === void 0) break;
    let entries;
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (signal?.aborted === true) throw new Error("repo_brief: aborted");
      seen += 1;
      if (seen > MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const full = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
        if (current.level + 1 <= depth) queue.push({ dir: full, level: current.level + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const info = await stat(full);
        files.push({
          rel: full.slice(root.length + 1).split(sep).join("/"),
          size: info.size,
          mtime: info.mtimeMs,
          ext: extname(entry.name).toLowerCase()
        });
      } catch {
      }
    }
    if (truncated) break;
  }
  return { files, truncated };
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return void 0;
  }
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function languages(files) {
  const counts = /* @__PURE__ */ new Map();
  for (const file of files) {
    const key = file.ext === "" ? "(none)" : file.ext;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
}
function detectTestCommand(pkg, has) {
  const scripts = pkg?.scripts;
  if (scripts?.test !== void 0) return `npm test  (scripts.test: ${scripts.test})`;
  if (has("go.mod")) return "go test ./...";
  if (has("Cargo.toml")) return "cargo test";
  if (has("pyproject.toml") || has("requirements.txt")) return "pytest";
  if (has("pom.xml")) return "mvn test";
  if (has("build.gradle")) return "gradle test";
  return void 0;
}
async function buildBrief(inputPath, depth, signal) {
  const root = inputPath;
  const { files, truncated } = await walk(root, depth, signal);
  const has = (path) => files.some((file) => file.rel === path);
  const pkg = has("package.json") ? await readJson(join(root, "package.json")) : void 0;
  const lines = [];
  lines.push(`# Repository brief: ${root}`);
  lines.push("");
  lines.push(`Scanned ${files.length} files up to depth ${depth}${truncated ? " (truncated \u2014 large tree)" : ""}.`);
  const langs = languages(files);
  if (langs.length > 0) {
    lines.push("");
    lines.push("## Languages");
    lines.push(langs.map(([ext, count]) => `${ext} \xD7 ${count}`).join(" \xB7 "));
  }
  if (pkg !== void 0) {
    lines.push("");
    lines.push("## package.json");
    const name = typeof pkg.name === "string" ? pkg.name : "(unnamed)";
    const version = typeof pkg.version === "string" ? pkg.version : "";
    lines.push(`${name}${version === "" ? "" : ` ${version}`}`);
    const scripts = pkg.scripts;
    if (scripts !== void 0) {
      const entries2 = Object.entries(scripts).slice(0, 12);
      lines.push("scripts: " + entries2.map(([key, value]) => `${key}=${value}`).join(" | "));
    }
    const deps = pkg.dependencies;
    if (deps !== void 0) {
      const names = Object.keys(deps);
      lines.push(`dependencies (${names.length}): ${names.slice(0, 15).join(", ")}${names.length > 15 ? " \u2026" : ""}`);
    }
    const dev = pkg.devDependencies;
    if (dev !== void 0) {
      const names = Object.keys(dev);
      lines.push(`devDependencies (${names.length}): ${names.slice(0, 12).join(", ")}${names.length > 12 ? " \u2026" : ""}`);
    }
  }
  const entries = ENTRY_CANDIDATES.filter(has);
  if (entries.length > 0) {
    lines.push("");
    lines.push("## Likely entry points");
    for (const entry of entries.slice(0, 10)) lines.push(`- ${entry}`);
  }
  const test = detectTestCommand(pkg, has);
  if (test !== void 0) {
    lines.push("");
    lines.push(`## Test: ${test}`);
  }
  const recent = [...files].sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  if (recent.length > 0) {
    lines.push("");
    lines.push("## Recently modified");
    for (const file of recent) lines.push(`- ${file.rel}  (${new Date(file.mtime).toISOString().slice(0, 16).replace("T", " ")})`);
  }
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
  if (largest.length > 0) {
    lines.push("");
    lines.push("## Largest files");
    for (const file of largest) lines.push(`- ${file.rel}  (${formatBytes(file.size)})`);
  }
  const directories = [...new Set(files.map((file) => file.rel.includes("/") ? file.rel.split("/")[0] : ""))].filter((name) => name !== "").slice(0, 20);
  if (directories.length > 0) {
    lines.push("");
    lines.push("## Top-level directories");
    lines.push(directories.join(" \xB7 "));
  }
  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}
\u2026 (truncated)` : text;
}
var inject = ["tools"];
function apply(ctx) {
  ctx.tools.register({
    name: "repo_brief",
    description: "Map a repository in one call instead of exploring it step by step. Returns languages, package.json scripts and dependencies, likely entry points, the test command, recently modified files, largest files and top-level directories. Use it first when entering an unfamiliar project or when you need orientation before editing.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path of the repository root. Defaults to the current working directory."
        },
        depth: {
          type: "number",
          description: "Directory depth to scan, 1-6. Defaults to 4."
        }
      },
      additionalProperties: false
    },
    output: {
      schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false
      },
      render: (_args, value) => [
        { type: "text", text: String(value.text) }
      ]
    },
    async execute(args, exec) {
      const input = args ?? {};
      const root = typeof input.path === "string" && input.path !== "" ? input.path : process.cwd();
      const requested = typeof input.depth === "number" ? input.depth : 4;
      const depth = Math.max(1, Math.min(6, Math.round(requested)));
      const signal = exec.signal;
      const text = await buildBrief(root, depth, signal);
      return { text };
    }
  });
}
export {
  apply,
  inject
};
