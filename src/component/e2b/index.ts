import {
  AuthenticationError,
  RateLimitError,
  SandboxError,
  SandboxNotFoundError,
  TimeoutError,
} from "./errors.js";
import { E2BClient, type SandboxClient } from "./client.js";
import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

export type { SandboxClient };

export function getE2B() {
  return new E2BClient({
    apiKey: env.E2B_API_KEY,
    ...(env.E2B_DOMAIN ? { domain: env.E2B_DOMAIN } : {}),
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof SandboxNotFoundError;
}

export function classifyError(error: unknown) {
  if (error instanceof AuthenticationError) return "auth" as const;
  if (error instanceof SandboxNotFoundError) return "notFound" as const;
  if (error instanceof RateLimitError) return "rateLimit" as const;
  if (error instanceof TimeoutError) return "transient" as const;
  return "other" as const;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  preserveNotFound = false,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const kind = classifyError(error);
      if (kind !== "rateLimit" && kind !== "transient") {
        if (preserveNotFound && kind === "notFound") throw error;
        throwComponentError(error);
      }
      if (attempt < 2) {
        const base = 100 * 2 ** attempt;
        await new Promise((resolve) =>
          setTimeout(resolve, base + Math.floor(Math.random() * base)),
        );
      }
    }
  }
  throwComponentError(lastError);
}

export function isTimeout(error: unknown) {
  return (
    error instanceof TimeoutError ||
    (error instanceof TypeError &&
      error.message.includes("stream is not in a state that permits close"))
  );
}

export function throwComponentError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  const kind = classifyError(error);
  const message = error instanceof Error ? error.message : String(error);
  const code =
    kind === "auth"
      ? "AuthenticationFailed"
      : kind === "notFound"
        ? "SandboxGone"
        : kind === "rateLimit"
          ? "RateLimited"
          : kind === "transient"
            ? "E2BUnavailable"
            : error instanceof SandboxError
              ? "E2BError"
              : "ComponentError";
  throw new ConvexError({ code, message });
}

export async function componentOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throwComponentError(error);
  }
}
