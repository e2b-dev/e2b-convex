import type { E2B, E2BActionCtx, SandboxIdentity } from "./index.js";

// Parallel tool calls on a fresh key would each create a sandbox; sharing one
// in-flight getOrCreate per scope:key makes them converge on a single one.
// ponytail: cache grows by one entry per distinct thread the tool set serves;
// scope it per generation if long-lived agents become a problem.
export function sandboxPinner(e2b: E2B) {
  const pinned = new Map<string, Promise<string>>();
  return async (
    ctx: E2BActionCtx,
    identity: SandboxIdentity,
  ): Promise<SandboxIdentity> => {
    if (identity.sandboxId) return identity;
    const cacheKey = `${identity.scope}\0${identity.key}`;
    let sandboxId = pinned.get(cacheKey);
    if (!sandboxId) {
      sandboxId = e2b.getOrCreate(ctx, identity).then((r) => r.sandboxId);
      sandboxId.catch(() => pinned.delete(cacheKey));
      pinned.set(cacheKey, sandboxId);
    }
    return { ...identity, sandboxId: await sandboxId };
  };
}
