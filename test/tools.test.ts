import { describe, expect, test, vi } from "vitest";
import { createAiSdkTools } from "../src/client/ai.js";
import { createAgentTools } from "../src/client/agent.js";
import { sandboxPinner } from "../src/client/pin.js";
import type { E2B } from "../src/client/index.js";

describe("sandbox pinning", () => {
  test("parallel calls on a fresh key share one getOrCreate", async () => {
    const getOrCreate = vi.fn(async () => ({ sandboxId: "sb1" }));
    const pin = sandboxPinner({ getOrCreate } as unknown as E2B);
    const identity = { scope: "u", key: "t" };
    const results = await Promise.all([
      pin({} as never, identity),
      pin({} as never, identity),
      pin({} as never, { scope: "u", key: "other" }),
    ]);
    expect(getOrCreate).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.sandboxId)).toEqual(["sb1", "sb1", "sb1"]);
  });

  test("passes through a pinned sandboxId and retries after failure", async () => {
    const getOrCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sandboxId: "sb2" });
    const pin = sandboxPinner({ getOrCreate } as unknown as E2B);
    const pinned = { scope: "u", key: "t", sandboxId: "fixed" };
    expect(await pin({} as never, pinned)).toEqual(pinned);
    expect(getOrCreate).not.toHaveBeenCalled();
    await expect(pin({} as never, { scope: "u", key: "t" })).rejects.toThrow(
      "boom",
    );
    expect((await pin({} as never, { scope: "u", key: "t" })).sandboxId).toBe(
      "sb2",
    );
  });
});

describe("agent tools", () => {
  test("only exposes explicitly enabled capabilities", () => {
    const tools = createAgentTools({} as never, {
      scope: ({ userId }) => userId,
      key: ({ threadId }) => threadId,
      tools: { runCommand: { needsApproval: true }, readFile: {} },
    });
    expect(Object.keys(tools)).toEqual(["runCommand", "readFile"]);
    expect(tools.runCommand.needsApproval).toBeDefined();
    expect(tools.getHost).toBeUndefined();
  });
});

describe("AI SDK tools", () => {
  test("only exposes explicitly enabled capabilities", () => {
    const tools = createAiSdkTools({} as never, {} as never, {
      scope: "user",
      key: "thread",
      tools: { readFile: { needsApproval: true }, getHost: false },
    });

    expect(Object.keys(tools)).toEqual(["readFile"]);
    expect(tools.readFile.needsApproval).toBe(true);
    expect(tools.getHost).toBeUndefined();
  });
});
