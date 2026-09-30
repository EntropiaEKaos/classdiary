import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/app/actions");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const failures = [];
for (const file of await walk(root)) {
  const source = await readFile(file, "utf8");
  const actionPattern = /export\s+async\s+function\s+(\w+Action)\s*\([^)]*\)\s*\{/g;
  for (const match of source.matchAll(actionPattern)) {
    const start = (match.index ?? 0) + match[0].length;
    const bodyPrefix = source.slice(start, start + 600);
    if (!bodyPrefix.includes("assertTrustedMutationOrigin()")) {
      failures.push(path.relative(process.cwd(), file) + ":" + match[1]);
    }
  }
}

if (failures.length) {
  console.error("Server Actions sem assertTrustedMutationOrigin():");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Server Action origin guard: OK");
