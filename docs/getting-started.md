# Getting started

This guide takes an existing Convex application from installation to its first persistent E2B sandbox.

## Prerequisites

- A Convex application using Convex 1.45 or newer.
- Node.js 20 or newer.
- An E2B API key.

## 1. Install the component

```sh
npm install @e2b/convex
```

Your application must also have `convex` installed. It is a peer dependency so the package and app use the same Convex runtime.

## 2. Register it

```ts
// convex/convex.config.ts
import e2b from "@e2b/convex/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({ env: { E2B_API_KEY: v.string() } });
app.use(e2b, { env: { E2B_API_KEY: app.env.E2B_API_KEY } });

export default app;
```

Run `npx convex dev`. Convex generates `components.e2b` in your app's `_generated/api` module and deploys an isolated instance of the component.

## 3. Set the secret

```sh
npx convex env set E2B_API_KEY e2b_your_key
```

The key is available only to the component. Do not pass it through an action argument, tool input, or sandbox metadata.

## 4. Add an action

```ts
// convex/sandbox.ts
import { E2B } from "@e2b/convex";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";

const sandboxes = new E2B(components.e2b);

export const run = action({
  args: { userId: v.string(), sessionId: v.string(), command: v.string() },
  handler: async (ctx, args) => {
    const identity = { scope: args.userId, key: args.sessionId };
    const { sandboxId } = await sandboxes.getOrCreate(ctx, identity);
    return sandboxes.runCommand(ctx, {
      ...identity,
      sandboxId,
      command: args.command,
    });
  },
});
```

Try it from the CLI:

```sh
npx convex run sandbox:run \
  '{"userId":"demo-user","sessionId":"terminal-1","command":"pwd && uname -a"}'
```

Run another command with the same IDs to reuse the filesystem. Change `sessionId` to create another sandbox.

## Identity model

| Value       | Recommended source                        | Purpose                                                     |
| ----------- | ----------------------------------------- | ----------------------------------------------------------- |
| `scope`     | Authenticated user, team, or tenant ID    | Ownership and bulk cleanup boundary                         |
| `key`       | Agent thread, job, or terminal session ID | Stable sandbox identity inside the scope                    |
| `sandboxId` | Result of `getOrCreate`                   | Pins follow-up calls and prevents first-step creation races |

Do not use display names, email addresses, or an ownership value supplied by an untrusted client.

## Configure the sandbox

```ts
const sandboxes = new E2B(components.e2b, {
  template: "base",
  timeoutMs: 10 * 60_000,
  readRoots: ["/home/user/project"],
  writeRoots: ["/home/user/project"],
  network: {
    denyOut: ["0.0.0.0/0"],
    allowOut: ["registry.npmjs.org"],
  },
  envs: { NODE_ENV: "development" },
});
```

Template, network policy, and environment-variable names form a configuration fingerprint. An existing sandbox created under a different fingerprint fails with `ConfigurationConflict`; migrate it deliberately instead of silently weakening its policy.

## Test functions that use the component

Register the component with the same `convex-test` instance as your application:

```ts
import e2bTest from "@e2b/convex/test";
import { convexTest } from "convex-test";
import schema from "./convex/schema";

const modules = import.meta.glob("./convex/**/*.*s");
const test = convexTest(schema, modules);
e2bTest.register(test);
```

The test helper ships as TypeScript so Vitest transforms its component module map automatically; no dependency-inlining configuration is required.

## Next steps

- Add a coding agent with the [Convex Agent recipe](cookbook.md#convex-agent-with-persistent-tools).
- Use [plain AI SDK tools](cookbook.md#plain-ai-sdk-tools) without the Agent component.
- Review [security](security.md) before enabling shell commands or public preview hosts.
- Plan cleanup and policy changes with the [operations guide](operations.md).
