import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { createServer } from "vite";

const packageRoot = process.argv[2] ?? process.cwd();
const consumerRoot = await mkdtemp(join(tmpdir(), "e2b-convex-test-"));
const packageDirectory = join(consumerRoot, "node_modules", "@e2b");
await mkdir(packageDirectory, { recursive: true });
await symlink(packageRoot, join(packageDirectory, "convex"), "dir");
const packageJson = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);
for (const dependency of [
  "convex",
  ...Object.keys(packageJson.dependencies ?? {}),
]) {
  const destination = join(consumerRoot, "node_modules", dependency);
  await mkdir(dirname(destination), { recursive: true });
  await symlink(
    join(process.cwd(), "node_modules", dependency),
    destination,
    "dir",
  );
}
await writeFile(
  join(consumerRoot, "entry.ts"),
  'export { default } from "@e2b/convex/test";\n',
);

const server = await createServer({
  root: consumerRoot,
  logLevel: "silent",
  // Keep the package under node_modules so this check exercises Vite's normal
  // dependency externalization decision instead of following the symlink first.
  resolve: { preserveSymlinks: true },
  server: { middlewareMode: true },
});

try {
  const entry = await server.ssrLoadModule("/entry.ts");
  const paths = Object.keys(entry.default.modules);
  if (paths.length === 0 || paths.some((path) => path.endsWith(".d.ts"))) {
    throw new Error(
      `Published test helper matched invalid component modules: ${paths.join(", ") || "none"}`,
    );
  }
  const lifecyclePath = paths.find((path) =>
    /\/lifecycle\.(js|ts)$/.test(path),
  );
  if (!lifecyclePath)
    throw new Error("Published test helper omitted the lifecycle module");
  const lifecycle = await entry.default.modules[lifecyclePath]();
  if (typeof lifecycle.getOrCreate !== "function") {
    throw new Error("Published lifecycle module has no getOrCreate action");
  }
  process.stdout.write(
    `Verified published test helper from node_modules: ${paths.length} executable modules\n`,
  );
} finally {
  await server.close();
  await rm(consumerRoot, { recursive: true });
}
