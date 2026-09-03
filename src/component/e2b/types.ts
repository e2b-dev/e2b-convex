export interface NetworkOptions {
  allowOut?: string[];
  denyOut?: string[];
  allowPublicTraffic?: boolean;
}

export interface SandboxInfo {
  sandboxId: string;
  templateId: string;
  metadata: Record<string, string>;
  startedAt: Date;
  endAt: Date;
  state: "running" | "paused";
  envdVersion?: string;
  sandboxDomain?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface EntryInfo {
  name: string;
  path: string;
  type?: "file" | "dir" | "symlink";
  size: number;
  mode: number;
  permissions: string;
  owner: string;
  group: string;
  modifiedTime?: Date;
  symlinkTarget?: string;
}

export interface SandboxCreateOptions {
  timeoutMs: number;
  metadata?: Record<string, string>;
  envs?: Record<string, string>;
  network?: NetworkOptions;
  lifecycle?: { onTimeout: "pause" | "kill" };
}

export interface SandboxConnectionOptions {
  timeoutMs?: number;
}

export interface SandboxWire {
  sandboxID: string;
  templateID: string;
  alias?: string;
  metadata?: Record<string, string>;
  startedAt: string;
  endAt: string;
  state: "running" | "paused";
  envdVersion: string;
  envdAccessToken?: string;
  trafficAccessToken?: string;
  domain?: string;
}
