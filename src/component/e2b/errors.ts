import { Code, ConnectError } from "@connectrpc/connect";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

export class AuthenticationError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class SandboxNotFoundError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = "SandboxNotFoundError";
  }
}

export class FileNotFoundError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = "FileNotFoundError";
  }
}

export class TimeoutError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class CommandExitError extends SandboxError {
  constructor(
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
    readonly error?: string,
  ) {
    super(error ?? `Command exited with code ${exitCode}`);
    this.name = "CommandExitError";
  }
}

export function mapConnectError(error: unknown, fileOperation = false): Error {
  if (!(error instanceof ConnectError)) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return new TimeoutError(error.message);
    }
    if (error instanceof TypeError)
      return new TimeoutError(`E2B transport failed: ${error.message}`);
    return error instanceof Error ? error : new SandboxError(String(error));
  }
  if (error.code === Code.Unauthenticated)
    return new AuthenticationError(error.rawMessage);
  if (error.code === Code.ResourceExhausted)
    return new RateLimitError(error.rawMessage);
  if (error.code === Code.NotFound)
    return fileOperation
      ? new FileNotFoundError(error.rawMessage)
      : new SandboxNotFoundError(error.rawMessage);
  if (
    error.code === Code.Canceled ||
    error.code === Code.DeadlineExceeded ||
    error.code === Code.Unavailable
  ) {
    return new TimeoutError(error.rawMessage);
  }
  return new SandboxError(error.rawMessage);
}
