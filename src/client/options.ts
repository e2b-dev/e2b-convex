export interface NetworkOptions {
  allowOut?: string[];
  denyOut?: string[];
  allowPublicTraffic?: boolean;
}

export interface E2BOptions {
  template?: string;
  timeoutMs?: number;
  network?: NetworkOptions;
  envs?: Record<string, string>;
  readRoots?: string[];
  writeRoots?: string[];
}

export interface CommandOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export const DEFAULT_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024;
export const DEFAULT_MAX_READ_BYTES = 64 * 1024;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const MAX_READ_BYTES = 1024 * 1024;
export const MAX_WRITE_BYTES = 4 * 1024 * 1024;

export function boundedBytes(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
}

export function normalizeOptions(options: E2BOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new Error("timeoutMs must be a positive integer of at least 1000ms");
  }
  return {
    template: options.template ?? "base",
    timeoutMs,
    ...(options.network ? { network: options.network } : {}),
    ...(options.envs ? { envs: options.envs } : {}),
    readRoots: options.readRoots ?? ["/home/user", "/tmp"],
    writeRoots: options.writeRoots ?? ["/home/user", "/tmp"],
  };
}
