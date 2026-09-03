import { v } from "convex/values";
import { action } from "./_generated/server";
import { componentOperation, isTimeout } from "./e2b/index.js";
import { resolveSandbox } from "./lifecycle";
import {
  commandOutputPaths,
  readBoundedFile,
  readHeadTail,
  wrapCommand,
} from "./output";
import { assertReadablePath, assertWritablePath } from "./paths";
import { identityArgs } from "./validators";

const commandResultValidator = v.object({
  exitCode: v.number(),
  stdout: v.string(),
  stderr: v.string(),
  truncated: v.boolean(),
  stdoutPath: v.string(),
  stderrPath: v.string(),
  stdoutBytes: v.number(),
  stderrBytes: v.number(),
  timedOut: v.boolean(),
});

export const runCommand = action({
  args: {
    ...identityArgs,
    command: v.string(),
    commandTimeoutMs: v.number(),
    maxOutputBytes: v.number(),
    cwd: v.optional(v.string()),
    commandEnvs: v.optional(v.record(v.string(), v.string())),
  },
  returns: commandResultValidator,
  handler: async (_ctx, args) =>
    componentOperation(async () => {
      const { sandbox } = await resolveSandbox(args);
      const id = crypto.randomUUID();
      const { stdoutPath, stderrPath } = commandOutputPaths(id);
      let exitCode = 124;
      let timedOut = false;
      try {
        const result = await sandbox.commands.run(
          wrapCommand(
            args.command,
            stdoutPath,
            stderrPath,
            args.commandTimeoutMs,
          ),
          {
            timeoutMs: args.commandTimeoutMs + 10_000,
            ...(args.cwd ? { cwd: args.cwd } : {}),
            ...(args.commandEnvs ? { envs: args.commandEnvs } : {}),
          },
        );
        exitCode = Number.parseInt(
          result.stdout.trim().split(/\s+/).at(-1) ?? "",
          10,
        );
        if (!Number.isInteger(exitCode)) {
          throw new Error(
            "E2B command wrapper did not return a valid exit code",
          );
        }
        timedOut = exitCode === 124;
      } catch (error) {
        if (!isTimeout(error)) throw error;
        timedOut = true;
      }
      const empty = { content: "", bytes: 0, truncated: false };
      const readOutput = async (path: string) => {
        try {
          return await readHeadTail(sandbox, path, args.maxOutputBytes);
        } catch (error) {
          if (timedOut) return empty;
          throw error;
        }
      };
      const [stdout, stderr] = await Promise.all([
        readOutput(stdoutPath),
        readOutput(stderrPath),
      ]);
      return {
        exitCode,
        timedOut,
        stdout: stdout.content,
        stderr: stderr.content,
        truncated: stdout.truncated || stderr.truncated,
        stdoutPath,
        stderrPath,
        stdoutBytes: stdout.bytes,
        stderrBytes: stderr.bytes,
      };
    }),
});

export const readFile = action({
  args: {
    ...identityArgs,
    path: v.string(),
    offset: v.optional(v.number()),
    maxBytes: v.number(),
    roots: v.array(v.string()),
  },
  returns: v.object({
    path: v.string(),
    content: v.string(),
    bytes: v.number(),
    truncated: v.boolean(),
    offset: v.number(),
  }),
  handler: async (_ctx, args) =>
    componentOperation(async () => {
      const { sandbox } = await resolveSandbox(args);
      const path = await assertReadablePath(sandbox, args.path, args.roots);
      const offset = Math.max(0, Math.floor(args.offset ?? 0));
      const result = await readBoundedFile(
        sandbox,
        path,
        args.maxBytes,
        offset,
      );
      return { path, offset, ...result };
    }),
});

export const writeFile = action({
  args: {
    ...identityArgs,
    path: v.string(),
    content: v.string(),
    maxBytes: v.number(),
    roots: v.array(v.string()),
  },
  returns: v.object({ path: v.string(), bytesWritten: v.number() }),
  handler: async (_ctx, args) =>
    componentOperation(async () => {
      const bytes = new TextEncoder().encode(args.content).byteLength;
      if (bytes > args.maxBytes) {
        throw new Error(`File content exceeds the ${args.maxBytes} byte limit`);
      }
      const { sandbox } = await resolveSandbox(args);
      const path = await assertWritablePath(sandbox, args.path, args.roots);
      await sandbox.files.write(path, args.content);
      return { path, bytesWritten: bytes };
    }),
});

const entryValidator = v.object({
  name: v.string(),
  path: v.string(),
  type: v.optional(v.string()),
  size: v.number(),
  mode: v.number(),
  permissions: v.string(),
  owner: v.string(),
  group: v.string(),
  modifiedAt: v.optional(v.number()),
  symlinkTarget: v.optional(v.string()),
});

export const listFiles = action({
  args: {
    ...identityArgs,
    path: v.string(),
    depth: v.number(),
    maxEntries: v.number(),
    roots: v.array(v.string()),
  },
  returns: v.object({
    path: v.string(),
    entries: v.array(entryValidator),
    truncated: v.boolean(),
  }),
  handler: async (_ctx, args) =>
    componentOperation(async () => {
      const { sandbox } = await resolveSandbox(args);
      const path = await assertReadablePath(sandbox, args.path, args.roots);
      const entries = await sandbox.files.list(path, { depth: args.depth });
      return {
        path,
        truncated: entries.length > args.maxEntries,
        entries: entries.slice(0, args.maxEntries).map((entry) => ({
          name: entry.name,
          path: entry.path,
          ...(entry.type ? { type: String(entry.type) } : {}),
          size: entry.size,
          mode: entry.mode,
          permissions: entry.permissions,
          owner: entry.owner,
          group: entry.group,
          ...(entry.modifiedTime
            ? { modifiedAt: entry.modifiedTime.getTime() }
            : {}),
          ...(entry.symlinkTarget
            ? { symlinkTarget: entry.symlinkTarget }
            : {}),
        })),
      };
    }),
});

export const getHost = action({
  args: { ...identityArgs, port: v.number() },
  returns: v.object({ host: v.string() }),
  handler: async (_ctx, args) =>
    componentOperation(async () => {
      if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
        throw new Error("port must be an integer between 1 and 65535");
      }
      const { sandbox } = await resolveSandbox(args);
      return { host: sandbox.getHost(args.port) };
    }),
});
