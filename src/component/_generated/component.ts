/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    exec: {
      getHost: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          network?: any;
          port: number;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        { host: string },
        Name
      >;
      listFiles: FunctionReference<
        "action",
        "internal",
        {
          depth: number;
          envs?: Record<string, string>;
          key: string;
          maxEntries: number;
          network?: any;
          path: string;
          roots: Array<string>;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        {
          entries: Array<{
            group: string;
            mode: number;
            modifiedAt?: number;
            name: string;
            owner: string;
            path: string;
            permissions: string;
            size: number;
            symlinkTarget?: string;
            type?: string;
          }>;
          path: string;
          truncated: boolean;
        },
        Name
      >;
      readFile: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          maxBytes: number;
          network?: any;
          offset?: number;
          path: string;
          roots: Array<string>;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        {
          bytes: number;
          content: string;
          offset: number;
          path: string;
          truncated: boolean;
        },
        Name
      >;
      runCommand: FunctionReference<
        "action",
        "internal",
        {
          command: string;
          commandEnvs?: Record<string, string>;
          commandTimeoutMs: number;
          cwd?: string;
          envs?: Record<string, string>;
          key: string;
          maxOutputBytes: number;
          network?: any;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        {
          exitCode: number;
          stderr: string;
          stderrBytes: number;
          stderrPath: string;
          stdout: string;
          stdoutBytes: number;
          stdoutPath: string;
          timedOut: boolean;
          truncated: boolean;
        },
        Name
      >;
      writeFile: FunctionReference<
        "action",
        "internal",
        {
          content: string;
          envs?: Record<string, string>;
          key: string;
          maxBytes: number;
          network?: any;
          path: string;
          roots: Array<string>;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        { bytesWritten: number; path: string },
        Name
      >;
    };
    lifecycle: {
      getInfo: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          network?: any;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        {
          endAt: number;
          metadata: Record<string, string>;
          sandboxId: string;
          startedAt: number;
          state: "running" | "paused";
          templateId: string;
        } | null,
        Name
      >;
      getOrCreate: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          network?: any;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        { created: boolean; sandboxId: string; state: "running" | "paused" },
        Name
      >;
      kill: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          network?: any;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        { killed: boolean; sandboxId?: string },
        Name
      >;
      killScope: FunctionReference<
        "action",
        "internal",
        { limit?: number; scope: string },
        { killed: number; more: boolean },
        Name
      >;
      list: FunctionReference<
        "action",
        "internal",
        { cursor?: string; limit?: number; scope: string },
        {
          cursor: string | null;
          items: Array<{
            endAt: number;
            metadata: Record<string, string>;
            sandboxId: string;
            startedAt: number;
            state: "running" | "paused";
            templateId: string;
          }>;
        },
        Name
      >;
      pause: FunctionReference<
        "action",
        "internal",
        {
          envs?: Record<string, string>;
          key: string;
          network?: any;
          sandboxId?: string;
          scope: string;
          template: string;
          timeoutMs: number;
        },
        { paused: boolean; sandboxId?: string },
        Name
      >;
      sweep: FunctionReference<
        "action",
        "internal",
        { limit?: number; olderThanMs: number },
        { killed: number; more: boolean },
        Name
      >;
    };
  };
