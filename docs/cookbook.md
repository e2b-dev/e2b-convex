# Cookbook

These recipes assume the E2B component is registered and `E2B_API_KEY` is bound as shown in [getting started](getting-started.md).

## Persistent terminal session

Use an authenticated owner as `scope` and a terminal or job ID as `key`:

```ts
const identity = { scope: userId, key: terminalSessionId };
const sandbox = await sandboxes.getOrCreate(ctx, identity);

const result = await sandboxes.runCommand(ctx, {
  ...identity,
  sandboxId: sandbox.sandboxId,
  command: "npm test",
  cwd: "/home/user/project",
  timeoutMs: 2 * 60_000,
  maxOutputBytes: 16 * 1024,
});

console.log(result.stdout, result.stderr, result.exitCode);
```

The complete terminal UI is in [`example/src/main.ts`](../example/src/main.ts).

## Convex Agent with persistent tools

Install and register the Convex Agent component alongside E2B:

```sh
npm install @convex-dev/agent ai @ai-sdk/openai
```

```ts
// convex/convex.config.ts
import agent from "@convex-dev/agent/convex.config";
import e2b from "@e2b/convex/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({ env: { E2B_API_KEY: v.string() } });
app.use(agent);
app.use(e2b, { env: { E2B_API_KEY: app.env.E2B_API_KEY } });
export default app;
```

Tool sets resolve each scope/key once and share the result across parallel tool calls. Resolving before generation is still recommended: it surfaces creation errors early and skips the first lookup:

```ts
import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { E2B } from "@e2b/convex";
import { createAgentTools } from "@e2b/convex/agent";
import { stepCountIs } from "ai";
import { components } from "./_generated/api";

const sandboxes = new E2B(components.e2b, { timeoutMs: 10 * 60_000 });

const threadAgent = new Agent(components.agent, {
  name: "coding-agent",
  languageModel: openai("gpt-5-mini"),
});

const threadId =
  existingThreadId ??
  (await threadAgent.createThread(ctx, { userId })).threadId;

const { sandboxId } = await sandboxes.getOrCreate(ctx, {
  scope: userId,
  key: threadId,
});

const codingAgent = new Agent(components.agent, {
  name: "coding-agent",
  languageModel: openai("gpt-5-mini"),
  tools: createAgentTools(sandboxes, {
    scope: ({ userId }) => userId,
    key: ({ threadId }) => threadId,
    sandboxId,
    command: { timeoutMs: 60_000, maxOutputBytes: 16 * 1024 },
    tools: {
      runCommand: { needsApproval: true },
      readFile: {},
      writeFile: { needsApproval: true },
      listFiles: {},
    },
  }),
});

const result = await codingAgent.generateText(
  ctx,
  { userId, threadId },
  { prompt, stopWhen: stepCountIs(20) },
  {
    contextOptions: {
      recentMessages: 12,
      excludeToolMessages: true,
    },
  },
);
```

Approval is intentionally enabled for commands and writes. A private trusted workflow can use a policy callback or disable approval, but a public chat should implement the Agent component's approval flow.

Keep command and file output bounded. Long threads should cap recent messages or use a custom context handler so old tool results do not exhaust the model context window.

## Plain AI SDK tools

Use this when an action owns the conversation and you do not need Convex Agent thread storage:

```ts
import { createAiSdkTools } from "@e2b/convex/ai";
import { generateText, stepCountIs } from "ai";

const identity = { scope: userId, key: jobId };
const { sandboxId } = await sandboxes.getOrCreate(ctx, identity);

const tools = createAiSdkTools(sandboxes, ctx, {
  ...identity,
  sandboxId,
  command: { maxOutputBytes: 16 * 1024 },
  tools: {
    runCommand: { needsApproval: true },
    readFile: {},
    listFiles: {},
  },
});

const result = await generateText({
  model: languageModel,
  prompt,
  tools,
  stopWhen: stepCountIs(12),
});
```

## Read and write files

```ts
await sandboxes.writeFile(ctx, {
  ...identity,
  sandboxId,
  path: "/home/user/project/input.csv",
  content: csv,
});

const listing = await sandboxes.listFiles(ctx, {
  ...identity,
  sandboxId,
  path: "/home/user/project",
  depth: 2,
});

const file = await sandboxes.readFile(ctx, {
  ...identity,
  sandboxId,
  path: "/home/user/project/report.md",
  maxBytes: 16 * 1024,
});
```

An offset can retrieve the next bounded portion. File paths must remain under the client's configured read or write roots.

## Pause, resume, and delete

```ts
await sandboxes.pause(ctx, identity);

// Resumes the paused match and refreshes its timeout.
const resumed = await sandboxes.getOrCreate(ctx, identity);

await sandboxes.kill(ctx, { ...identity, sandboxId: resumed.sandboxId });
```

When deleting an account, call `killScope` until no more sandboxes remain:

```ts
let more: boolean;
do {
  ({ more } = await sandboxes.killScope(ctx, { scope: userId }));
} while (more);
```

## Public preview host

`getHost` returns the E2B host for a port. It is available on the minimal client but omitted from agent tools unless explicitly enabled:

```ts
const tools = createAgentTools(sandboxes, {
  scope: ({ userId }) => userId,
  key: ({ threadId }) => threadId,
  sandboxId,
  tools: {
    runCommand: { needsApproval: true },
    getHost: { needsApproval: true },
  },
});
```

Treat a preview URL as public capability-bearing output. Require approval and do not expose services containing secrets or private data.
