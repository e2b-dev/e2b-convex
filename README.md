# @e2b/convex

Persistent [E2B](https://e2b.dev) sandboxes for Convex applications and AI agents.

`@e2b/convex` is a tableless Convex component with a small V8-compatible E2B client. It gives Convex actions sandbox lifecycle, commands, bounded file operations, preview hosts, Convex Agent tools, and plain AI SDK tools without shipping the full Node-oriented E2B SDK into the Convex runtime.

> Pre-1.0: validate the package against your E2B template and network policy before production use.

## Install

```sh
npm install @e2b/convex
npx convex env set E2B_API_KEY e2b_your_key
```

Register the component and bind the secret in your Convex app:

```ts
// convex/convex.config.ts
import e2b from "@e2b/convex/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({ env: { E2B_API_KEY: v.string() } });
app.use(e2b, { env: { E2B_API_KEY: app.env.E2B_API_KEY } });

export default app;
```

## Run a command

Create the client in a Convex action and identify the sandbox with an application-owned `scope` and `key`:

```ts
// convex/sandbox.ts
import { E2B } from "@e2b/convex";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";

const sandboxes = new E2B(components.e2b, {
  template: "base",
  timeoutMs: 10 * 60_000,
});

export const run = action({
  args: { userId: v.string(), sessionId: v.string(), command: v.string() },
  handler: async (ctx, args) => {
    const identity = { scope: args.userId, key: args.sessionId };
    const sandbox = await sandboxes.getOrCreate(ctx, identity);

    return sandboxes.runCommand(ctx, {
      ...identity,
      sandboxId: sandbox.sandboxId,
      command: args.command,
    });
  },
});
```

Calls with the same scope and key reuse the same running or paused sandbox. Resolve it once before parallel work and pass `sandboxId` to subsequent operations.

## Integrations

- **Minimal API:** lifecycle, shell commands, files, directories, and preview hosts.
- **Convex Agent:** `sandboxes.agentTools(...)` creates thread-aware tools with optional approval rules.
- **AI SDK:** `sandboxes.aiSdkTools(...)` creates standard AI SDK tools inside any Convex action.

Start with the [getting-started guide](docs/getting-started.md), then use the copy-paste [cookbook](docs/cookbook.md). The complete local app in [`example`](example/README.md) includes an xterm.js terminal and a realtime agent chat with visible tool calls.

## Defaults and limits

- Sandboxes pause on timeout and are rediscovered through namespaced E2B metadata. Any operation on a paused sandbox resumes it, which restarts billing.
- Every operation resolves the sandbox first (`getInfo` + `connect`, or a metadata list when `sandboxId` is absent), adding roughly a second per call.
- Scope and key values are hashed before entering E2B metadata.
- Command output is bounded to 32 KiB per stream by default.
- Command output and individual file reads are capped at 1 MiB.
- File reads default to 64 KiB; writes are capped at 4 MiB.
- File tools are restricted to `/home/user` and `/tmp` unless configured otherwise.
- `getHost` is not exposed to an agent unless explicitly enabled.
- Every E2B request is tagged with `e2b-convex/<version>` for integration attribution.

See [security](docs/security.md), [operations](docs/operations.md), and [architecture](docs/architecture.md) before deploying an agent that executes untrusted instructions.

## Status

The package uses E2B's public APIs and includes only the Process and Filesystem protocol descriptors required by the component. The pinned `e2b` package is a development-only protocol source. CI rejects Node built-ins or full-SDK imports in the emitted Convex runtime and a scheduled real-service test watches for protocol drift.

MIT
