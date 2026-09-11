import type { E2B, E2BActionCtx, SandboxIdentity } from "./index.js";

// One in-flight getOrCreate per scope:key so parallel tool calls converge.
// ponytail: one cache entry per thread served; scope per generation if it grows.
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
