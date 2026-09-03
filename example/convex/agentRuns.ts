import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const status = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("error"),
);

export const create = mutation({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  returns: v.id("agentRuns"),
  handler: (ctx, args) =>
    ctx.db.insert("agentRuns", { ...args, status: "queued" }),
});

export const get = query({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const events = await ctx.db
      .query("agentRunEvents")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    return { run, events };
  },
});

export const update = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    status: v.optional(status),
    threadId: v.optional(v.string()),
    sandboxId: v.optional(v.string()),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...patch }) => {
    await ctx.db.patch(runId, patch);
  },
});

export const addEvent = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    kind: v.union(v.literal("status"), v.literal("tool")),
    name: v.string(),
    input: v.optional(v.string()),
    output: v.optional(v.string()),
  },
  handler: (ctx, args) => ctx.db.insert("agentRunEvents", args),
});
