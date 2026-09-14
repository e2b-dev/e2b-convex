import { E2BClient } from "../dist/component/e2b/client.js";
import process from "node:process";

if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");

const client = new E2BClient({ apiKey: process.env.E2B_API_KEY });
const marker = `convex-e2e-${Date.now()}`;
const metadata = {
  convex_ns: process.env.E2B_NAMESPACE ?? "convex-e2b-e2e",
  convex_scope_h: marker,
  convex_key_h: marker,
  convex_gen: "e2e",
  convex_schema: "1",
};
const sandbox = await client.Sandbox.create({
  metadata,
  timeoutMs: 120_000,
  lifecycle: { onTimeout: "pause" },
});

try {
  await sandbox.files.write("/tmp/convex-e2b.txt", "hello from convex e2e");
  const result = await sandbox.commands.run("cat /tmp/convex-e2b.txt");
  if (result.stdout.trim() !== "hello from convex e2e")
    throw new Error("exec/read mismatch");

  const listed = [];
  const paginator = client.Sandbox.list({ query: { metadata } });
  while (paginator.hasNext) listed.push(...(await paginator.nextItems()));
  if (!listed.some((item) => item.sandboxId === sandbox.sandboxId)) {
    throw new Error("metadata lookup did not find the created sandbox");
  }

  await sandbox.pause();
  const resumed = await client.Sandbox.connect(sandbox.sandboxId, {
    timeoutMs: 120_000,
  });
  const afterResume = await resumed.commands.run("printf 42");
  if (afterResume.stdout !== "42") throw new Error("pause/resume mismatch");
  process.stdout.write(`E2E passed for ${sandbox.sandboxId}\n`);
} finally {
  await client.Sandbox.kill(sandbox.sandboxId).catch(() => undefined);
}
