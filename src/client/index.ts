import type { FunctionReference } from "convex/server";
import type { ComponentApi as GeneratedComponentApi } from "../component/_generated/component.js";
import { translateComponentError } from "./errors.js";
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_MAX_READ_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  boundedBytes,
  normalizeOptions,
  type E2BOptions,
} from "./options.js";

type ActionReference = FunctionReference<"action", "internal">;

export type ComponentApi = GeneratedComponentApi;

export interface E2BActionCtx {
  runAction(
    reference: ActionReference,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface SandboxIdentity {
  scope: string;
  key: string;
  sandboxId?: string;
}

export interface RunCommandArgs extends SandboxIdentity {
  command: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  cwd?: string;
  envs?: Record<string, string>;
}

export interface ReadFileArgs extends SandboxIdentity {
  path: string;
  offset?: number;
  maxBytes?: number;
}

export interface WriteFileArgs extends SandboxIdentity {
  path: string;
  content: string;
}

export interface ListFilesArgs extends SandboxIdentity {
  path: string;
  depth?: number;
  maxEntries?: number;
}

export interface SandboxSummary {
  sandboxId: string;
  state: "running" | "paused";
  templateId: string;
  startedAt: number;
  endAt: number;
  metadata: Record<string, string>;
}

export interface SandboxListResult {
  items: SandboxSummary[];
  cursor: string | null;
}

export interface SandboxFileEntry {
  name: string;
  path: string;
  type?: string;
  size: number;
  mode: number;
  permissions: string;
  owner: string;
  group: string;
  modifiedAt?: number;
  symlinkTarget?: string;
}

export interface ListFilesResult {
  path: string;
  entries: SandboxFileEntry[];
  truncated: boolean;
}

export class E2B {
  readonly options: ReturnType<typeof normalizeOptions>;

  constructor(
    readonly component: ComponentApi,
    options: E2BOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  private policy() {
    const { template, timeoutMs, network, envs } = this.options;
    return {
      template,
      timeoutMs,
      ...(network ? { network } : {}),
      ...(envs ? { envs } : {}),
    };
  }

  private async call<T>(
    ctx: E2BActionCtx,
    reference: ActionReference,
    args: Record<string, unknown>,
  ) {
    try {
      return (await ctx.runAction(reference, args)) as T;
    } catch (error) {
      translateComponentError(error);
    }
  }

  async getOrCreate(ctx: E2BActionCtx, identity: SandboxIdentity) {
    return this.call<{
      sandboxId: string;
      state: "running" | "paused";
      created: boolean;
    }>(ctx, this.component.lifecycle.getOrCreate, {
      ...this.policy(),
      ...identity,
    });
  }

  async status(ctx: E2BActionCtx, identity: SandboxIdentity) {
    return this.call<{
      sandboxId: string;
      state: "running" | "paused";
      templateId: string;
      startedAt: number;
      endAt: number;
      metadata: Record<string, string>;
    } | null>(ctx, this.component.lifecycle.getInfo, {
      ...this.policy(),
      ...identity,
    });
  }

  async pause(ctx: E2BActionCtx, identity: SandboxIdentity) {
    return this.call<{ sandboxId?: string; paused: boolean }>(
      ctx,
      this.component.lifecycle.pause,
      { ...this.policy(), ...identity },
    );
  }

  async kill(ctx: E2BActionCtx, identity: SandboxIdentity) {
    return this.call<{ sandboxId?: string; killed: boolean }>(
      ctx,
      this.component.lifecycle.kill,
      { ...this.policy(), ...identity },
    );
  }

  async list(
    ctx: E2BActionCtx,
    args: { scope: string; cursor?: string; limit?: number },
  ) {
    return this.call<SandboxListResult>(
      ctx,
      this.component.lifecycle.list,
      args,
    );
  }

  async killScope(ctx: E2BActionCtx, args: { scope: string; limit?: number }) {
    return this.call<{ killed: number; more: boolean }>(
      ctx,
      this.component.lifecycle.killScope,
      args,
    );
  }

  async sweep(
    ctx: E2BActionCtx,
    args: { olderThanMs: number; limit?: number },
  ) {
    return this.call<{ killed: number; more: boolean }>(
      ctx,
      this.component.lifecycle.sweep,
      args,
    );
  }

  async runCommand(ctx: E2BActionCtx, args: RunCommandArgs) {
    const { envs: commandEnvs, ...commandArgs } = args;
    const maxOutputBytes = boundedBytes(
      args.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
    );
    return this.call<{
      exitCode: number;
      stdout: string;
      stderr: string;
      truncated: boolean;
      stdoutPath: string;
      stderrPath: string;
      stdoutBytes: number;
      stderrBytes: number;
      timedOut: boolean;
    }>(ctx, this.component.exec.runCommand, {
      ...this.policy(),
      ...commandArgs,
      commandTimeoutMs: args.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      maxOutputBytes,
      ...(commandEnvs ? { commandEnvs } : {}),
      timeoutMs: this.options.timeoutMs,
    });
  }

  async readFile(ctx: E2BActionCtx, args: ReadFileArgs) {
    const maxBytes = boundedBytes(
      args.maxBytes,
      DEFAULT_MAX_READ_BYTES,
      MAX_READ_BYTES,
    );
    return this.call<{
      path: string;
      content: string;
      bytes: number;
      truncated: boolean;
      offset: number;
    }>(ctx, this.component.exec.readFile, {
      ...this.policy(),
      ...args,
      maxBytes,
      roots: this.options.readRoots,
    });
  }

  async writeFile(ctx: E2BActionCtx, args: WriteFileArgs) {
    return this.call<{ path: string; bytesWritten: number }>(
      ctx,
      this.component.exec.writeFile,
      {
        ...this.policy(),
        ...args,
        maxBytes: MAX_WRITE_BYTES,
        roots: this.options.writeRoots,
      },
    );
  }

  async listFiles(ctx: E2BActionCtx, args: ListFilesArgs) {
    const depth = Math.min(Math.max(Math.floor(args.depth ?? 2), 0), 8);
    const maxEntries = Math.min(
      Math.max(Math.floor(args.maxEntries ?? 200), 1),
      1_000,
    );
    return this.call<ListFilesResult>(ctx, this.component.exec.listFiles, {
      ...this.policy(),
      ...args,
      depth,
      maxEntries,
      roots: this.options.readRoots,
    });
  }

  async getHost(ctx: E2BActionCtx, args: SandboxIdentity & { port: number }) {
    return this.call<{ host: string }>(ctx, this.component.exec.getHost, {
      ...this.policy(),
      ...args,
    });
  }
}

export type { CommandOptions, E2BOptions, NetworkOptions } from "./options.js";
export * from "./errors.js";
