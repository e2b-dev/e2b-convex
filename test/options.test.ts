import { describe, expect, test } from "vitest";
import { boundedBytes, normalizeOptions } from "../src/client/options.js";

describe("client options", () => {
  test("applies safe defaults", () => {
    expect(normalizeOptions()).toMatchObject({
      template: "base",
      timeoutMs: 600_000,
      readRoots: ["/home/user", "/tmp"],
      writeRoots: ["/home/user", "/tmp"],
    });
  });

  test("rejects unusable timeouts", () => {
    expect(() => normalizeOptions({ timeoutMs: 0 })).toThrow("at least 1000ms");
  });

  test("bounds byte counts to a safe positive range", () => {
    expect(boundedBytes(undefined, 64, 1_024)).toBe(64);
    expect(boundedBytes(-10, 64, 1_024)).toBe(1);
    expect(boundedBytes(10_000, 64, 1_024)).toBe(1_024);
  });
});
