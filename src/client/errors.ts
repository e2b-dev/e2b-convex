export class E2BConvexError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class SandboxGone extends E2BConvexError {
  constructor(
    message = "The E2B sandbox no longer exists",
    options?: ErrorOptions,
  ) {
    super(message, "SandboxGone", options);
  }
}
export class ConfigurationConflict extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "ConfigurationConflict", options);
  }
}
export class CapabilityDenied extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "CapabilityDenied", options);
  }
}
export class RateLimited extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "RateLimited", options);
  }
}
export class AuthenticationFailed extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "AuthenticationFailed", options);
  }
}
export class E2BUnavailable extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "E2BUnavailable", options);
  }
}
export class SandboxFileNotFound extends E2BConvexError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "FileNotFound", options);
  }
}

export function translateComponentError(error: unknown): never {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error as { data?: unknown }).data
      : undefined;
  const code =
    typeof data === "object" && data !== null && "code" in data
      ? String((data as { code: unknown }).code)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const options = { cause: error };
  if (code === "SandboxGone") throw new SandboxGone(message, options);
  if (code === "ConfigurationConflict") {
    throw new ConfigurationConflict(message, options);
  }
  if (code === "CapabilityDenied") throw new CapabilityDenied(message, options);
  if (code === "RateLimited") throw new RateLimited(message, options);
  if (code === "AuthenticationFailed") {
    throw new AuthenticationFailed(message, options);
  }
  if (code === "E2BUnavailable") throw new E2BUnavailable(message, options);
  if (code === "FileNotFound") throw new SandboxFileNotFound(message, options);
  if (code === "E2BError" || code === "ComponentError") {
    throw new E2BConvexError(message, code, options);
  }
  throw error;
}
