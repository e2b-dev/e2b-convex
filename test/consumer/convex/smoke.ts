import { E2B, SandboxFileNotFound } from "@e2b/convex";
import { action } from "./_generated/server";
import { components } from "./_generated/api";

const e2b = new E2B(components.e2b, { timeoutMs: 120_000 });

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export const run = action({
  args: {},
  handler: async (ctx) => {
    const identity = {
      scope: `e2e-${Date.now()}`,
      key: `thread-${Math.random().toString(36).slice(2)}`,
    };
    const created = await e2b.getOrCreate(ctx, identity);
    const sandboxId = created.sandboxId;
    try {
      const again = await e2b.getOrCreate(ctx, { ...identity, sandboxId });
      invariant(created.created, "sandbox was not created");
      invariant(
        !again.created && again.sandboxId === sandboxId,
        "sandbox was not reused",
      );

      const big = await e2b.runCommand(ctx, {
        ...identity,
        sandboxId,
        command: "yes abcdefghij | head -c 50000000; echo ERR >&2; exit 3",
        maxOutputBytes: 2_048,
      });
      invariant(big.exitCode === 3, `unexpected exit code ${big.exitCode}`);
      invariant(big.truncated, "large output was not marked truncated");
      invariant(
        big.stdoutBytes === 50_000_000,
        "large output byte count was lost",
      );
      invariant(big.stdout.length <= 2_048, "large output exceeded its bound");

      const timeout = await e2b.runCommand(ctx, {
        ...identity,
        sandboxId,
        command: "printf before-timeout; sleep 10; printf after-timeout",
        timeoutMs: 1_000,
        maxOutputBytes: 2_048,
      });
      invariant(timeout.timedOut, "command timeout was not reported");
      invariant(
        timeout.exitCode === 124,
        "command timeout did not use exit code 124",
      );
      invariant(
        timeout.stdout.includes("before-timeout"),
        "partial timeout output was lost",
      );

      await e2b.writeFile(ctx, {
        ...identity,
        sandboxId,
        path: "/home/user/x.txt",
        content: "hello",
      });
      const read = await e2b.readFile(ctx, {
        ...identity,
        sandboxId,
        path: "x.txt",
      });
      invariant(read.content === "hello", "file round trip failed");

      let escaped = false;
      try {
        await e2b.readFile(ctx, {
          ...identity,
          sandboxId,
          path: "/etc/passwd",
        });
      } catch (error) {
        escaped =
          error instanceof Error &&
          error.message.includes("outside the configured read roots");
      }
      invariant(escaped, "read root escape was not rejected");

      let missingTyped = false;
      try {
        await e2b.readFile(ctx, {
          ...identity,
          sandboxId,
          path: "/home/user/does-not-exist.txt",
        });
      } catch (error) {
        missingTyped = error instanceof SandboxFileNotFound;
      }
      invariant(
        missingTyped,
        "missing file did not produce SandboxFileNotFound",
      );
      return { sandboxId, outputBytes: big.stdoutBytes, passed: true };
    } finally {
      await e2b.kill(ctx, identity);
    }
  },
});
