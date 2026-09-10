import { describe, expect, test } from "vitest";
import {
  commandOutputPaths,
  parseWrappedResult,
  readBoundedFile,
  shellQuote,
  wrapCommand,
} from "../src/component/output.js";
import type { SandboxClient } from "../src/component/e2b/index.js";
import { vi } from "vitest";

describe("bounded command wrapper", () => {
  test("quotes apostrophes without allowing command injection", () => {
    expect(shellQuote("echo 'hello'")).toBe("'echo '\"'\"'hello'\"'\"''");
  });

  test("redirects both streams and reports the recorded exit code", () => {
    const paths = commandOutputPaths("fixed");
    const wrapped = wrapCommand("yes x | head -c 200000000", paths);
    expect(wrapped).toContain(">'/tmp/.convex-e2b/fixed.out'");
    expect(wrapped).toContain("2>'/tmp/.convex-e2b/fixed.err'");
    expect(wrapped).toContain(">'\"'\"'/tmp/.convex-e2b/fixed.code'\"'\"'");
    expect(wrapped).toContain("printf '%s %s\\n'");
  });

  test("enforces command timeouts inside the sandbox", () => {
    const wrapped = wrapCommand("sleep 60", commandOutputPaths("timed"), 1_500);
    expect(wrapped).toContain("timeout --signal=TERM --kill-after=2s '1.5s'");
  });

  test("distinguishes a user exit code 124 from a timeout", () => {
    expect(parseWrappedResult("124 0\n")).toEqual({
      exitCode: 124,
      timedOut: false,
    });
    expect(parseWrappedResult("124 1\n")).toEqual({
      exitCode: 124,
      timedOut: true,
    });
    expect(() => parseWrappedResult("garbage")).toThrow("valid exit code");
  });

  test("uses byte offsets efficiently and removes materialized slices", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });
    const sandbox = {
      commands: { run },
      files: {
        getInfo: vi.fn().mockResolvedValue({ size: 100 }),
        read: vi.fn().mockResolvedValue(new Blob(["hello"]).stream()),
      },
    } as unknown as SandboxClient;

    await expect(
      readBoundedFile(sandbox, "/tmp/output", 5, 90),
    ).resolves.toEqual({ content: "hello", bytes: 100, truncated: true });
    expect(run.mock.calls[0][0]).toContain(
      "bs=64K skip=90 count=5 iflag=skip_bytes,count_bytes",
    );
    expect(run.mock.calls[1][0]).toMatch(/^rm -f -- .*\.slice'$/);
  });
});
