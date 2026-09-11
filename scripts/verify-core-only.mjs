// Installs the packed tarball into a consumer that has neither `ai` nor
// `@convex-dev/agent`, then proves the root entry loads and type-checks.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageRoot = process.cwd();
const consumer = await mkdtemp(join(tmpdir(), "e2b-convex-core-only-"));

try {
  const { stdout } = await run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", consumer],
    { cwd: packageRoot },
  );
  const [{ filename }] = JSON.parse(stdout);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "core-only-consumer",
      private: true,
      type: "module",
      dependencies: { "@e2b/convex": `file:./${filename}`, convex: "^1.45.0" },
      devDependencies: { typescript: "^5.9.2" },
    }),
  );
  await writeFile(
    join(consumer, "main.ts"),
    [
      'import { E2B, SandboxGone, type E2BOptions } from "@e2b/convex";',
      "const options: E2BOptions = { timeoutMs: 60_000 };",
      "const client = new E2B({} as never, options);",
      "if (!(client instanceof E2B) || !SandboxGone) throw new Error('root import broken');",
      "console.log('core-only import ok');",
    ].join("\n"),
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        types: [],
      },
      files: ["main.ts"],
    }),
  );
  await run("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
    cwd: consumer,
  });
  const installed = await run("npm", ["ls", "ai", "@convex-dev/agent"], {
    cwd: consumer,
  }).catch((error) => error);
  if (/ai@|agent@/.test(installed.stdout ?? "")) {
    throw new Error("optional peers were installed into a core-only consumer");
  }
  await run("npx", ["tsc", "-p", "."], { cwd: consumer });
  const { stdout: out } = await run(
    process.execPath,
    ["--experimental-strip-types", "main.ts"],
    { cwd: consumer },
  );
  process.stdout.write(out);
  for (const subpath of ["@e2b/convex/agent", "@e2b/convex/ai"]) {
    const result = await run(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(subpath)})`],
      { cwd: consumer },
    ).catch((error) => error);
    if (!/ERR_MODULE_NOT_FOUND/.test(result.stderr ?? "")) {
      throw new Error(`${subpath} should fail clearly without its peer`);
    }
  }
  process.stdout.write("core-only consumer verified\n");
} finally {
  await rm(consumer, { recursive: true });
}
