import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makeIdentity } from "../src/component/identity.js";

const state = vi.hoisted(() => ({
  listed: [] as Array<Record<string, unknown>>,
  info: null as Record<string, unknown> | null,
  infoIds: [] as string[],
  killedIds: [] as string[],
  notFound: false,
  notFoundError: new Error("not found"),
}));

vi.mock("../src/component/e2b/index.js", () => ({
  componentOperation: async (operation: () => Promise<unknown>) => operation(),
  getE2B: () => ({
    Sandbox: {
      getInfo: vi.fn(async (sandboxId: string) => {
        state.infoIds.push(sandboxId);
        if (state.notFound) throw state.notFoundError;
        return state.info;
      }),
      kill: vi.fn(async (sandboxId: string) => {
        state.killedIds.push(sandboxId);
        return true;
      }),
      list: vi.fn(() => ({
        hasNext: true,
        async nextItems() {
          this.hasNext = false;
          return state.listed;
        },
      })),
    },
  }),
  isNotFound: (error: unknown) => error === state.notFoundError,
  withRetry: async (operation: () => Promise<unknown>) => operation(),
}));

import { getInfo, kill, resolveSandbox } from "../src/component/lifecycle.js";

const policy = { template: "base", timeoutMs: 60_000 };

async function sandboxInfo(sandboxId: string, generation?: string) {
  const identity = await makeIdentity("test", "user", "thread", policy);
  return {
    sandboxId,
    state: "running" as const,
    templateId: "base",
    startedAt: new Date(0),
    endAt: new Date(1),
    metadata: {
      ...identity.metadata,
      ...(generation ? { convex_gen: generation } : {}),
    },
  };
}

describe("sandbox lifecycle targeting", () => {
  beforeEach(() => {
    vi.stubEnv("E2B_NAMESPACE", "test");
    state.listed = [];
    state.info = null;
    state.infoIds = [];
    state.killedIds = [];
    state.notFound = false;
  });

  test("uses an explicitly supplied sandbox ID for status", async () => {
    state.info = await sandboxInfo("explicit");
    state.listed = [await sandboxInfo("oldest")];

    const result = await (
      getInfo as unknown as {
        _handler: (
          ctx: unknown,
          args: typeof policy & {
            scope: string;
            key: string;
            sandboxId: string;
          },
        ) => Promise<{ sandboxId: string } | null>;
      }
    )._handler(
      {},
      {
        ...policy,
        scope: "user",
        key: "thread",
        sandboxId: "explicit",
      },
    );

    expect(result?.sandboxId).toBe("explicit");
    expect(state.infoIds).toEqual(["explicit"]);
  });

  test("returns null when an explicitly supplied sandbox no longer exists", async () => {
    state.notFound = true;

    const result = await (
      getInfo as unknown as {
        _handler: (
          ctx: unknown,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    )._handler(
      {},
      {
        ...policy,
        scope: "user",
        key: "thread",
        sandboxId: "missing",
      },
    );

    expect(result).toBeNull();
    expect(state.infoIds).toEqual(["missing"]);
  });

  test("rejects an explicit sandbox owned by another identity", async () => {
    state.info = await sandboxInfo("foreign");
    state.info.metadata = {
      ...(state.info.metadata as Record<string, string>),
      convex_key_h: "another-key",
    };

    await expect(
      (
        getInfo as unknown as {
          _handler: (
            ctx: unknown,
            args: Record<string, unknown>,
          ) => Promise<unknown>;
        }
      )._handler(
        {},
        {
          ...policy,
          scope: "user",
          key: "thread",
          sandboxId: "foreign",
        },
      ),
    ).rejects.toMatchObject({
      data: { code: "CapabilityDenied" },
    });
  });

  test("reports a cached sandbox policy mismatch as a configuration conflict", async () => {
    state.info = await sandboxInfo("explicit", "old-generation");

    try {
      await resolveSandbox({
        ...policy,
        scope: "user",
        key: "thread",
        sandboxId: "explicit",
      });
      throw new Error("Expected resolveSandbox to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as unknown as { data: unknown }).data).toMatchObject({
        code: "ConfigurationConflict",
      });
    }
  });

  test("allows an owned stale-generation sandbox to be killed", async () => {
    state.info = await sandboxInfo("stale", "old-generation");

    const result = await (
      kill as unknown as {
        _handler: (
          ctx: unknown,
          args: Record<string, unknown>,
        ) => Promise<{ sandboxId?: string; killed: boolean }>;
      }
    )._handler(
      {},
      {
        ...policy,
        scope: "user",
        key: "thread",
        sandboxId: "stale",
      },
    );

    expect(result).toEqual({ sandboxId: "stale", killed: true });
    expect(state.killedIds).toEqual(["stale"]);
  });
});
