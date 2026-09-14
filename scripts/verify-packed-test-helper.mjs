import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageRoot = process.cwd();
const stagingRoot = await mkdtemp(join(tmpdir(), "e2b-convex-pack-"));

try {
  const { stdout } = await run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", stagingRoot],
    { cwd: packageRoot },
  );
  const [{ filename }] = JSON.parse(stdout);
  await run("tar", ["-xzf", join(stagingRoot, filename), "-C", stagingRoot]);
  const result = await run(
    process.execPath,
    [
      join(packageRoot, "scripts/verify-test-helper.mjs"),
      join(stagingRoot, "package"),
    ],
    { cwd: packageRoot },
  );
  process.stdout.write(result.stdout);
} finally {
  await rm(stagingRoot, { recursive: true });
}
