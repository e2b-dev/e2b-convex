import { v } from "convex/values";

export const policyArgs = {
  template: v.string(),
  timeoutMs: v.number(),
  network: v.optional(v.any()),
  envs: v.optional(v.record(v.string(), v.string())),
};

export const identityArgs = {
  scope: v.string(),
  key: v.string(),
  sandboxId: v.optional(v.string()),
  ...policyArgs,
};

export const sandboxInfoValidator = v.object({
  sandboxId: v.string(),
  state: v.union(v.literal("running"), v.literal("paused")),
  templateId: v.string(),
  startedAt: v.number(),
  endAt: v.number(),
  metadata: v.record(v.string(), v.string()),
});

export const resolvedSandboxValidator = v.object({
  sandboxId: v.string(),
  state: v.union(v.literal("running"), v.literal("paused")),
  created: v.boolean(),
});
