import { createTool, type ToolCtx } from "@convex-dev/agent";
import { jsonSchema, type ToolSet } from "ai";
import type { E2B } from "./index.js";
import { MAX_READ_BYTES, type CommandOptions } from "./options.js";
import { sandboxPinner } from "./pin.js";

type MaybePromise<T> = T | Promise<T>;
type Resolver<Ctx> = string | ((ctx: Ctx) => MaybePromise<string | undefined>);
type Approval<Ctx, Input> =
  | boolean
  | ((ctx: Ctx, input: Input, options: unknown) => MaybePromise<boolean>);

export interface CapabilityOptions<Ctx, Input> {
  needsApproval?: Approval<Ctx, Input>;
}

export interface AgentToolsOptions<Ctx extends ToolCtx = ToolCtx> {
  scope: Resolver<Ctx>;
  key: Resolver<Ctx>;
  sandboxId?: Resolver<Ctx>;
  command?: CommandOptions;
  tools: {
    runCommand?:
      false | CapabilityOptions<Ctx, { command: string; cwd?: string }>;
    readFile?:
      | false
      | CapabilityOptions<
          Ctx,
          { path: string; offset?: number; maxBytes?: number }
        >;
    writeFile?:
      false | CapabilityOptions<Ctx, { path: string; content: string }>;
    listFiles?:
      false | CapabilityOptions<Ctx, { path: string; depth?: number }>;
    getHost?: false | CapabilityOptions<Ctx, { port: number }>;
  };
}

async function resolveValue<Ctx>(
  resolver: Resolver<Ctx> | undefined,
  ctx: Ctx,
) {
  if (resolver === undefined) return undefined;
  return typeof resolver === "function" ? resolver(ctx) : resolver;
}

async function resolveIdentity<Ctx extends ToolCtx>(
  options: AgentToolsOptions<Ctx>,
  ctx: Ctx,
) {
  const [scope, key, sandboxId] = await Promise.all([
    resolveValue(options.scope, ctx),
    resolveValue(options.key, ctx),
    resolveValue(options.sandboxId, ctx),
  ]);
  if (!scope) throw new Error("E2B tool scope resolver returned no value");
  if (!key) throw new Error("E2B tool key resolver returned no value");
  return { scope, key, ...(sandboxId ? { sandboxId } : {}) };
}

function approval<Ctx, Input>(value: Approval<Ctx, Input> | undefined) {
  if (typeof value !== "function") return value;
  return (ctx: Ctx, input: Input, options: unknown) =>
    value(ctx, input, options);
}

export function createAgentTools<Ctx extends ToolCtx>(
  e2b: E2B,
  options: AgentToolsOptions<Ctx>,
): ToolSet {
  const tools: ToolSet = {};
  const pin = sandboxPinner(e2b);
  const identity = async (ctx: Ctx) =>
    pin(ctx, await resolveIdentity(options, ctx));
  const runCommand = options.tools.runCommand;
  if (runCommand !== undefined && runCommand !== false) {
    tools.runCommand = createTool({
      description:
        "Run a shell command in the thread's persistent E2B sandbox.",
      inputSchema: jsonSchema<{ command: string; cwd?: string }>({
        type: "object",
        properties: { command: { type: "string" }, cwd: { type: "string" } },
        required: ["command"],
        additionalProperties: false,
      }),
      needsApproval: approval(runCommand.needsApproval),
      execute: async (ctx: Ctx, input) =>
        e2b.runCommand(ctx, {
          ...(await identity(ctx)),
          ...input,
          timeoutMs: options.command?.timeoutMs,
          maxOutputBytes: options.command?.maxOutputBytes,
        }),
    });
  }
  const readFile = options.tools.readFile;
  if (readFile !== undefined && readFile !== false) {
    tools.readFile = createTool({
      description: "Read a bounded portion of a file in the E2B sandbox.",
      inputSchema: jsonSchema<{
        path: string;
        offset?: number;
        maxBytes?: number;
      }>({
        type: "object",
        properties: {
          path: { type: "string" },
          offset: { type: "number", minimum: 0 },
          maxBytes: { type: "number", minimum: 1, maximum: MAX_READ_BYTES },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      needsApproval: approval(readFile.needsApproval),
      execute: async (ctx: Ctx, input) =>
        e2b.readFile(ctx, { ...(await identity(ctx)), ...input }),
    });
  }
  const writeFile = options.tools.writeFile;
  if (writeFile !== undefined && writeFile !== false) {
    tools.writeFile = createTool({
      description: "Write a text file in an allowed root of the E2B sandbox.",
      inputSchema: jsonSchema<{ path: string; content: string }>({
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      needsApproval: approval(writeFile.needsApproval),
      execute: async (ctx: Ctx, input) =>
        e2b.writeFile(ctx, { ...(await identity(ctx)), ...input }),
    });
  }
  const listFiles = options.tools.listFiles;
  if (listFiles !== undefined && listFiles !== false) {
    tools.listFiles = createTool({
      description: "List files under an allowed root of the E2B sandbox.",
      inputSchema: jsonSchema<{ path: string; depth?: number }>({
        type: "object",
        properties: { path: { type: "string" }, depth: { type: "number" } },
        required: ["path"],
        additionalProperties: false,
      }),
      needsApproval: approval(listFiles.needsApproval),
      execute: async (ctx: Ctx, input) =>
        e2b.listFiles(ctx, { ...(await identity(ctx)), ...input }),
    });
  }
  const getHost = options.tools.getHost;
  if (getHost !== undefined && getHost !== false) {
    tools.getHost = createTool({
      description: "Return the public host for a port in the E2B sandbox.",
      inputSchema: jsonSchema<{ port: number }>({
        type: "object",
        properties: { port: { type: "number" } },
        required: ["port"],
        additionalProperties: false,
      }),
      needsApproval: approval(getHost.needsApproval),
      execute: async (ctx: Ctx, input) =>
        e2b.getHost(ctx, { ...(await identity(ctx)), ...input }),
    });
  }
  return tools;
}
