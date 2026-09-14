import { describe, expect, test } from "vitest";
import {
  deriveNamespace,
  generationFingerprint,
  makeIdentity,
  validateIdentityPart,
} from "../src/component/identity.js";

describe("identity", () => {
  test("is deterministic and does not expose scope or key", async () => {
    const identity = await makeIdentity(
      "dev",
      "user@example.com",
      "thread_123",
      {
        template: "base",
        timeoutMs: 60_000,
      },
    );
    expect(identity.metadata.convex_ns).toBe("dev");
    expect(identity.metadata.convex_scope_h).toHaveLength(64);
    expect(identity.metadata.convex_key_h).toHaveLength(64);
    expect(JSON.stringify(identity.metadata)).not.toContain("user@example.com");
    expect(JSON.stringify(identity.metadata)).not.toContain("thread_123");
  });

  test("length-prefixes scope and key", async () => {
    const first = await makeIdentity("n", "ab", "c", {
      template: "base",
      timeoutMs: 1,
    });
    const second = await makeIdentity("n", "a", "bc", {
      template: "base",
      timeoutMs: 1,
    });
    expect(first.keyHash).not.toBe(second.keyHash);
  });

  test("generation ignores env values and timeout but includes policy shape", async () => {
    const a = await generationFingerprint({
      template: "base",
      timeoutMs: 1,
      envs: { TOKEN: "a" },
    });
    const b = await generationFingerprint({
      template: "base",
      timeoutMs: 2,
      envs: { TOKEN: "b" },
    });
    const c = await generationFingerprint({
      template: "python",
      timeoutMs: 2,
      envs: { TOKEN: "b" },
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test("derives a stable deployment namespace", async () => {
    expect(await deriveNamespace("custom", "https://ignored.example")).toBe(
      "custom",
    );
    expect(
      await deriveNamespace(undefined, "https://example.convex.site"),
    ).toMatch(/^site_[0-9a-f]{24}$/);
  });

  test("bounds identity input", () => {
    expect(() => validateIdentityPart("scope", "")).toThrow(
      "must not be empty",
    );
    expect(() => validateIdentityPart("key", "x".repeat(513))).toThrow(
      "at most 512",
    );
  });
});
