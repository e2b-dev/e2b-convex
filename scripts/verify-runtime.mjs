import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve("dist/component");
const files = (await readdir(root, { recursive: true }))
  .filter((name) => name.endsWith(".js"))
  .map((name) => resolve(root, name));

let size = 0;
for (const path of files) {
  const source = await readFile(path, "utf8");
  if (/^\s*import .* from ["']node:/m.test(source))
    throw new Error(`V8 client imports a Node builtin: ${path}`);
  if (/from ["']e2b["']/m.test(source))
    throw new Error(`V8 client imports the full E2B SDK: ${path}`);
  size += (await stat(path)).size;
}

if (size > 100_000)
  throw new Error(`V8 E2B client is too large: ${size} bytes`);
process.stdout.write(
  `Verified minimal V8 E2B client: ${size} bytes, no Node or full-SDK imports\n`,
);
