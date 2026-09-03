import { E2B } from "@e2b/convex";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { components } from "./_generated/api";

const sandboxes = new E2B(components.e2b, {
  template: "base",
  timeoutMs: 10 * 60_000,
});

export const run = action({
  args: {
    scope: v.string(),
    key: v.string(),
    command: v.string(),
  },
  returns: v.object({
    sandboxId: v.string(),
    created: v.boolean(),
    exitCode: v.number(),
    stdout: v.string(),
    stderr: v.string(),
    truncated: v.boolean(),
    timedOut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const resolved = await sandboxes.getOrCreate(ctx, {
      scope: args.scope,
      key: args.key,
    });
    const result = await sandboxes.runCommand(ctx, {
      scope: args.scope,
      key: args.key,
      sandboxId: resolved.sandboxId,
      command: args.command,
    });
    return {
      sandboxId: resolved.sandboxId,
      created: resolved.created,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
      timedOut: result.timedOut,
    };
  },
});
