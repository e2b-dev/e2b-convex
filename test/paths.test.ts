import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import type { SandboxClient } from "../src/component/e2b/index.js";
import {
  assertReadablePath,
  assertWritablePath,
} from "../src/component/paths.js";

function sandboxWith(run: (command: string) => Promise<{ stdout: string }>) {
  return { commands: { run: vi.fn(run) } } as unknown as SandboxClient;
}

describe("sandbox path boundaries", () => {
  test("allows canonical paths inside a configured root", async () => {
    const sandbox = sandboxWith(async (command) => ({
      stdout: command.includes("project/file.txt")
        ? "/home/user/project/file.txt\n"
        : "/home/user\n",
    }));

    await expect(
      assertReadablePath(sandbox, "project/file.txt", ["/home/user"]),
    ).resolves.toBe("/home/user/project/file.txt");
  });

  test("rejects readable paths whose canonical target escapes the root", async () => {
    const sandbox = sandboxWith(async (command) => ({
      stdout: command.includes("escape") ? "/etc/passwd\n" : "/home/user\n",
    }));

    await expect(
      assertReadablePath(sandbox, "/home/user/escape", ["/home/user"]),
    ).rejects.toThrow("outside the configured read roots");
  });

  test("rejects nonexistent readable paths with a typed component error", async () => {
    const sandbox = sandboxWith(async () => {
      throw new Error("missing");
    });

    await expect(
      assertReadablePath(sandbox, "/home/user/missing", ["/home/user"]),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  test("rejects writable paths resolved through an outside parent", async () => {
    const sandbox = sandboxWith(async (command) => ({
      stdout: command.startsWith("target=")
        ? "/etc/new-file\n"
        : "/home/user\n",
    }));

    await expect(
      assertWritablePath(sandbox, "/home/user/link/new-file", ["/home/user"]),
    ).rejects.toThrow("outside the configured write roots");
  });
});
