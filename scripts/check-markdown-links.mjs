import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

const DEFAULT_FILES = [
  "README.md",
  "SECURITY.md",
  "docs/SUBMISSION.md",
  "docs/architecture/security-model.md",
  "apps/web/README.md",
];

const files = process.argv.slice(2);
const targets = files.length > 0 ? files : DEFAULT_FILES;
const failures = [];

function localTarget(raw) {
  const value = raw.trim().replace(/^<|>$/g, "");
  if (!value || value.startsWith("#")) return null;
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(value)) return null;
  const [path] = value.split("#", 1);
  if (!path || isAbsolute(path)) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

for (const file of targets) {
  const source = await readFile(file, "utf8");
  const pattern = /!?(?:\[[^\]]*\])\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

  for (const match of source.matchAll(pattern)) {
    const target = localTarget(match[1]);
    if (!target) continue;

    const absolute = resolve(dirname(file), target);
    try {
      await access(absolute);
    } catch {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${file}:${line} -> ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:\n" + failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked local Markdown links in ${targets.length} files.`);
}
