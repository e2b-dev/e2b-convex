# Example playground

The example demonstrates both integration levels:

- **Minimal:** an xterm.js terminal backed by a persistent E2B sandbox.
- **Agentic:** a Convex Agent chat with realtime run status and expandable tool calls.

## Run locally

From the repository root, install the shared dependencies and start Convex. The
first run initializes the deployment, generates the component API, and builds
the package before starting the backend:

```sh
npm install
npm run dev
```

Set the server-side keys in another terminal:

```sh
npx convex env set E2B_API_KEY e2b_your_key
npx convex env set OPENAI_API_KEY sk_your_key
```

Start the web app using the deployment URL printed by `convex dev`:

```sh
VITE_CONVEX_URL="https://your-deployment.convex.cloud" npm run dev:frontend
```

Open the URL printed by Vite, normally `http://localhost:5173`.

The Minimal tab only needs `E2B_API_KEY`. Commands entered in the terminal reuse a session-scoped sandbox. The Agentic tab also needs `OPENAI_API_KEY`; it keeps a sandbox per Agent thread and displays sandbox setup and tool activity live.

The demo allows up to 20 model/tool steps. It bounds command output, excludes previous tool messages from later prompts, and caps recent conversation context. Commands and file writes auto-execute for demonstration purposes. Require approval before those operations in a public application.

## Call the backend directly

Minimal action:

```sh
npx convex run sandbox:run \
  '{"scope":"demo-user","key":"terminal-1","command":"uname -a && pwd"}'
```

Agent action:

```sh
npx convex run agent:prompt \
  '{"userId":"demo-user","prompt":"List the files in /home/user"}'
```

The agent response includes a `threadId`. Pass it to a later call to continue the conversation and reuse its sandbox.

## Relevant files

- [`convex/sandbox.ts`](convex/sandbox.ts): minimal lifecycle and command action.
- [`convex/agent.ts`](convex/agent.ts): Convex Agent integration and live run events.
- [`src/main.ts`](src/main.ts): terminal, chat, realtime subscription, and reconnect recovery.
- [`src/style.css`](src/style.css): E2B-inspired interface styling.
