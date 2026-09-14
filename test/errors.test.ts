import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import {
  RateLimitError,
  SandboxNotFoundError,
} from "../src/component/e2b/errors.js";
import {
  classifyError,
  throwComponentError,
} from "../src/component/e2b/index.js";
import {
  RateLimited,
  SandboxFileNotFound,
  translateComponentError,
} from "../src/client/errors.js";

describe("error translation", () => {
  test("does not retry arbitrary TypeErrors", () => {
    expect(classifyError(new TypeError("programming bug"))).toBe("other");
    expect(classifyError(new RateLimitError("slow down"))).toBe("rateLimit");
  });

  test("turns SDK errors into Convex error codes", () => {
    try {
      throwComponentError(new SandboxNotFoundError("gone"));
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as ConvexError<{ code: string }>).data.code).toBe(
        "SandboxGone",
      );
    }
  });

  test("turns boundary codes into public error classes", () => {
    expect(() =>
      translateComponentError({
        data: { code: "RateLimited" },
        message: "slow down",
      }),
    ).toThrow(RateLimited);
    expect(() =>
      translateComponentError({
        data: { code: "FileNotFound" },
        message: "missing",
      }),
    ).toThrow(SandboxFileNotFound);
  });
});
