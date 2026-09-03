import { describe, expect, test, vi } from "vitest";
import { RateLimited } from "../src/client/errors.js";
import { E2B } from "../src/client/index.js";
import { MAX_OUTPUT_BYTES, MAX_READ_BYTES } from "../src/client/options.js";

describe("public E2B client", () => {
  test("bounds caller-controlled output and read sizes", async () => {
    const runAction = vi.fn().mockResolvedValue({});
    const ctx = { runAction };
    const component = {
      exec: { runCommand: "runCommand", readFile: "readFile" },
    };
    const e2b = new E2B(component as never);
    const identity = { scope: "user", key: "thread" };

    await e2b.runCommand(ctx as never, {
      ...identity,
      command: "echo hello",
      maxOutputBytes: Number.MAX_SAFE_INTEGER,
    });
    expect(runAction.mock.calls[0][1]).toMatchObject({
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });

    await e2b.readFile(ctx as never, {
      ...identity,
      path: "/tmp/file",
      maxBytes: Number.MAX_SAFE_INTEGER,
    });
    expect(runAction.mock.calls[1][1]).toMatchObject({
      maxBytes: MAX_READ_BYTES,
    });
  });

  test("returns typed list payloads without altering them", async () => {
    const sandboxPage = { items: [], cursor: null };
    const filePage = { path: "/tmp", entries: [], truncated: false };
    const runAction = vi
      .fn()
      .mockResolvedValueOnce(sandboxPage)
      .mockResolvedValueOnce(filePage);
    const component = {
      lifecycle: { list: "list" },
      exec: { listFiles: "listFiles" },
    };
    const e2b = new E2B(component as never);
    const ctx = { runAction };

    const listed = await e2b.list(ctx as never, { scope: "user" });
    const files = await e2b.listFiles(ctx as never, {
      scope: "user",
      key: "thread",
      path: "/tmp",
    });

    expect(listed).toBe(sandboxPage);
    expect(files).toBe(filePage);
  });

  test("translates component errors at the client boundary", async () => {
    const component = { lifecycle: { getInfo: "getInfo" } };
    const e2b = new E2B(component as never);
    const ctx = {
      runAction: vi.fn().mockRejectedValue({
        data: { code: "RateLimited" },
        message: "slow down",
      }),
    };

    await expect(
      e2b.status(ctx as never, { scope: "user", key: "thread" }),
    ).rejects.toBeInstanceOf(RateLimited);
  });
});
