import { describe, expect, test } from "vitest";
import { createAgentTools } from "../src/client/agent.js";
import { createAiSdkTools } from "../src/client/ai.js";

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
