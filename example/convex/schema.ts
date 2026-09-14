import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentRuns: defineTable({
    userId: v.string(),
    threadId: v.optional(v.string()),
    prompt: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("error"),
    ),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
    sandboxId: v.optional(v.string()),
  }),
  agentRunEvents: defineTable({
    runId: v.id("agentRuns"),
    kind: v.union(v.literal("status"), v.literal("tool")),
    name: v.string(),
    input: v.optional(v.string()),
    output: v.optional(v.string()),
  }).index("by_run", ["runId"]),
});
