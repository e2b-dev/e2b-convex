import { jsonSchema, tool, type ToolSet } from "ai";
import type { E2B, E2BActionCtx } from "./index.js";
import { MAX_READ_BYTES, type CommandOptions } from "./options.js";
import { sandboxPinner } from "./pin.js";

type Approval<Input> =
  boolean | ((input: Input, options: unknown) => boolean | Promise<boolean>);
interface Capability<Input> {
  needsApproval?: Approval<Input>;
}

export interface AiSdkToolsOptions {
  scope: string;
  key: string;
  sandboxId?: string;
  command?: CommandOptions;
  tools: {
    runCommand?: false | Capability<{ command: string; cwd?: string }>;
    readFile?:
      false | Capability<{ path: string; offset?: number; maxBytes?: number }>;
    writeFile?: false | Capability<{ path: string; content: string }>;
    listFiles?: false | Capability<{ path: string; depth?: number }>;
    getHost?: false | Capability<{ port: number }>;
  };
}

export function createAiSdkTools(
  e2b: E2B,
  ctx: E2BActionCtx,
  options: AiSdkToolsOptions,
): ToolSet {
  const tools: ToolSet = {};
  const pin = sandboxPinner(e2b);
  const identity = () =>
    pin(ctx, {
      scope: options.scope,
      key: options.key,
      ...(options.sandboxId ? { sandboxId: options.sandboxId } : {}),
    });
  const runCommand = options.tools.runCommand;
  if (runCommand !== undefined && runCommand !== false) {
    tools.runCommand = tool({
      description:
        "Run a shell command in the thread's persistent E2B sandbox.",
      inputSchema: jsonSchema<{ command: string; cwd?: string }>({
        type: "object",
        properties: { command: { type: "string" }, cwd: { type: "string" } },
        required: ["command"],
        additionalProperties: false,
      }),
      needsApproval: runCommand.needsApproval,
      execute: async (input) =>
        e2b.runCommand(ctx, {
          ...(await identity()),
          ...input,
          timeoutMs: options.command?.timeoutMs,
          maxOutputBytes: options.command?.maxOutputBytes,
        }),
    });
  }
  const readFile = options.tools.readFile;
  if (readFile !== undefined && readFile !== false) {
    tools.readFile = tool({
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
      needsApproval: readFile.needsApproval,
      execute: async (input) =>
        e2b.readFile(ctx, { ...(await identity()), ...input }),
    });
  }
  const writeFile = options.tools.writeFile;
  if (writeFile !== undefined && writeFile !== false) {
    tools.writeFile = tool({
      description: "Write a text file in an allowed root of the E2B sandbox.",
      inputSchema: jsonSchema<{ path: string; content: string }>({
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      needsApproval: writeFile.needsApproval,
      execute: async (input) =>
        e2b.writeFile(ctx, { ...(await identity()), ...input }),
    });
  }
  const listFiles = options.tools.listFiles;
  if (listFiles !== undefined && listFiles !== false) {
    tools.listFiles = tool({
      description: "List files under an allowed root of the E2B sandbox.",
      inputSchema: jsonSchema<{ path: string; depth?: number }>({
        type: "object",
        properties: { path: { type: "string" }, depth: { type: "number" } },
        required: ["path"],
        additionalProperties: false,
      }),
      needsApproval: listFiles.needsApproval,
      execute: async (input) =>
        e2b.listFiles(ctx, { ...(await identity()), ...input }),
    });
  }
  const getHost = options.tools.getHost;
  if (getHost !== undefined && getHost !== false) {
    tools.getHost = tool({
      description: "Return the public host for a port in the E2B sandbox.",
      inputSchema: jsonSchema<{ port: number }>({
        type: "object",
        properties: { port: { type: "number" } },
        required: ["port"],
        additionalProperties: false,
      }),
      needsApproval: getHost.needsApproval,
      execute: async (input) =>
        e2b.getHost(ctx, { ...(await identity()), ...input }),
    });
  }
  return tools;
}
