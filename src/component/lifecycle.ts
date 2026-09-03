import { ConvexError, v } from "convex/values";
import type { SandboxInfo } from "./e2b/types.js";
import { action, env } from "./_generated/server";
import {
  componentOperation,
  getE2B,
  isNotFound,
  withRetry,
} from "./e2b/index.js";
import {
  deriveNamespace,
  makeIdentity,
  makeScopeMetadata,
  type CreationPolicy,
  type Identity,
} from "./identity";
import {
  identityArgs,
  resolvedSandboxValidator,
  sandboxInfoValidator,
} from "./validators";

type ResolveArgs = CreationPolicy & {
  scope: string;
  key: string;
  sandboxId?: string;
};

function serializeInfo(info: SandboxInfo) {
  return {
    sandboxId: info.sandboxId,
    state: info.state,
    templateId: info.templateId,
    startedAt: info.startedAt.getTime(),
    endAt: info.endAt.getTime(),
    metadata: info.metadata,
  };
}

async function componentNamespace() {
  return deriveNamespace(env.E2B_NAMESPACE, env.CONVEX_SITE_URL);
}

async function listAll(metadata: Record<string, string>) {
  const client = getE2B();
  const paginator = client.Sandbox.list({
    query: { metadata },
    order: "asc",
    limit: 100,
  });
  const items: SandboxInfo[] = [];
  while (paginator.hasNext)
    items.push(...(await withRetry(() => paginator.nextItems())));
  return items;
}

function assertGeneration(info: SandboxInfo, identity: Identity) {
  if (info.metadata.convex_gen !== identity.generation) {
    throw new ConvexError({
      code: "ConfigurationConflict",
      message: `Sandbox ${info.sandboxId} was created with a different template, network policy, or environment shape`,
      expectedGeneration: identity.generation,
      actualGeneration: info.metadata.convex_gen ?? null,
    });
  }
}

function assertMetadata(info: SandboxInfo, identity: Identity) {
  for (const [key, expected] of Object.entries(identity.metadata)) {
    if (info.metadata[key] !== expected) {
      throw new ConvexError({
        code: "CapabilityDenied",
        message: `Sandbox ${info.sandboxId} does not belong to this scope and key`,
      });
    }
  }
}

export async function resolveSandbox(args: ResolveArgs) {
  const client = getE2B();
  const namespace = await componentNamespace();
  const identity = await makeIdentity(namespace, args.scope, args.key, args);

  if (args.sandboxId) {
    try {
      const info = await withRetry(
        () => client.Sandbox.getInfo(args.sandboxId!),
        true,
      );
      assertMetadata(info, identity);
      assertGeneration(info, identity);
      const sandbox = await withRetry(
        () =>
          client.Sandbox.connect(args.sandboxId!, {
            timeoutMs: args.timeoutMs,
          }),
        true,
      );
      return { sandbox, created: false };
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  const matches = await listAll({
    convex_ns: identity.namespace,
    convex_scope_h: identity.scopeHash,
    convex_key_h: identity.keyHash,
    convex_schema: "1",
  });
  const existing = matches[0];
  if (existing) {
    assertGeneration(existing, identity);
    try {
      const sandbox = await withRetry(
        () =>
          client.Sandbox.connect(existing.sandboxId, {
            timeoutMs: args.timeoutMs,
          }),
        true,
      );
      return { sandbox, created: false };
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  const createOptions = {
    metadata: identity.metadata,
    lifecycle: { onTimeout: "pause" as const },
    timeoutMs: args.timeoutMs,
    ...(args.envs ? { envs: args.envs } : {}),
    ...(args.network ? { network: args.network } : {}),
  };
  // Creating is not safely retryable: a transport error can arrive after E2B
  // has provisioned the sandbox. The next invocation discovers it by metadata.
  const sandbox = await componentOperation(() =>
    args.template === "base"
      ? client.Sandbox.create(createOptions)
      : client.Sandbox.create(args.template, createOptions),
  );
  return { sandbox, created: true };
}

async function findInfo(args: ResolveArgs) {
  const namespace = await componentNamespace();
  const identity = await makeIdentity(namespace, args.scope, args.key, args);
  const matches = await listAll({
    convex_ns: identity.namespace,
    convex_scope_h: identity.scopeHash,
    convex_key_h: identity.keyHash,
    convex_schema: "1",
  });
  if (!matches[0]) return null;
  assertGeneration(matches[0], identity);
  return matches[0];
}

export const getOrCreate = action({
  args: identityArgs,
  returns: resolvedSandboxValidator,
  handler: async (_ctx, args) => {
    const { sandbox, created } = await resolveSandbox(args);
    const info = await withRetry(() => sandbox.getInfo());
    return { sandboxId: sandbox.sandboxId, state: info.state, created };
  },
});

export const getInfo = action({
  args: identityArgs,
  returns: v.union(sandboxInfoValidator, v.null()),
  handler: async (_ctx, args) => {
    const info = await findInfo(args);
    return info ? serializeInfo(info) : null;
  },
});

export const pause = action({
  args: identityArgs,
  returns: v.object({ sandboxId: v.optional(v.string()), paused: v.boolean() }),
  handler: async (_ctx, args) => {
    const info = await findInfo(args);
    if (!info) return { paused: false };
    if (info.state === "paused")
      return { sandboxId: info.sandboxId, paused: false };
    const paused = await withRetry(() =>
      getE2B().Sandbox.pause(info.sandboxId),
    );
    return { sandboxId: info.sandboxId, paused };
  },
});

export const kill = action({
  args: identityArgs,
  returns: v.object({ sandboxId: v.optional(v.string()), killed: v.boolean() }),
  handler: async (_ctx, args) => {
    const info = await findInfo(args);
    if (!info) return { killed: false };
    return {
      sandboxId: info.sandboxId,
      killed: await withRetry(() => getE2B().Sandbox.kill(info.sandboxId)),
    };
  },
});

export const list = action({
  args: {
    scope: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(sandboxInfoValidator),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (_ctx, { scope, cursor, limit }) => {
    const namespace = await componentNamespace();
    const all = await listAll(await makeScopeMetadata(namespace, scope));
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    const count = Math.min(Math.max(limit ?? 50, 1), 100);
    const page = all.slice(start, start + count);
    return {
      items: page.map(serializeInfo),
      cursor:
        start + page.length < all.length ? String(start + page.length) : null,
    };
  },
});

export const killScope = action({
  args: {
    scope: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    killed: v.number(),
    more: v.boolean(),
  }),
  handler: async (_ctx, { scope, limit }) => {
    const namespace = await componentNamespace();
    const all = await listAll(await makeScopeMetadata(namespace, scope));
    const count = Math.min(Math.max(limit ?? 25, 1), 100);
    const batch = all.slice(0, count);
    const outcomes = await Promise.all(
      batch.map((item) =>
        withRetry(() => getE2B().Sandbox.kill(item.sandboxId)),
      ),
    );
    return {
      killed: outcomes.filter(Boolean).length,
      more: all.length > batch.length,
    };
  },
});

export const sweep = action({
  args: {
    olderThanMs: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    killed: v.number(),
    more: v.boolean(),
  }),
  handler: async (_ctx, { olderThanMs, limit }) => {
    const namespace = await componentNamespace();
    const all = await listAll({ convex_ns: namespace });
    const groups = new Map<string, SandboxInfo[]>();
    const orphans: SandboxInfo[] = [];
    for (const item of all) {
      const scope = item.metadata.convex_scope_h;
      const key = item.metadata.convex_key_h;
      if (!scope || !key || item.metadata.convex_schema !== "1") {
        orphans.push(item);
        continue;
      }
      const groupKey = `${scope}:${key}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
    }
    const cutoff = Date.now() - olderThanMs;
    const candidates = [
      ...orphans,
      ...Array.from(groups.values()).flatMap((items) => items.slice(1)),
    ].filter((item) => item.startedAt.getTime() <= cutoff);
    const count = Math.min(Math.max(limit ?? 25, 1), 100);
    const batch = candidates.slice(0, count);
    const outcomes = await Promise.all(
      batch.map((item) =>
        withRetry(() => getE2B().Sandbox.kill(item.sandboxId)),
      ),
    );
    return {
      killed: outcomes.filter(Boolean).length,
      more: candidates.length > batch.length,
    };
  },
});
