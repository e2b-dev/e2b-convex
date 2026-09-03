import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = convexUrl ? new ConvexClient(convexUrl) : undefined;
const httpClient = convexUrl ? new ConvexHttpClient(convexUrl) : undefined;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
let agentThreadId: string | undefined;

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll<HTMLButtonElement>(".tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll<HTMLElement>(".panel").forEach((panel) => {
      const active = panel.id === `${tab.dataset.panel}-panel`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    if (tab.dataset.panel === "minimal") {
      requestAnimationFrame(() => {
        fitAddon.fit();
        terminal.focus();
      });
    }
  });
});

const terminal = new Terminal({
  cursorBlink: true,
  cursorStyle: "bar",
  fontFamily: '"SFMono-Regular", "Cascadia Code", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.45,
  scrollback: 2_000,
  theme: {
    background: "#090b0a",
    foreground: "#d9ddd7",
    cursor: "#ff3d3d",
    cursorAccent: "#090b0a",
    selectionBackground: "#3a1c1c",
    black: "#090b0a",
    brightBlack: "#737970",
    red: "#ff5c5c",
    green: "#74c98a",
    yellow: "#f4cc5d",
    blue: "#79a8ff",
    magenta: "#d79aff",
    cyan: "#6edfd0",
    white: "#d9ddd7",
  },
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.querySelector<HTMLDivElement>("#terminal")!);
fitAddon.fit();

const terminalState =
  document.querySelector<HTMLSpanElement>("#terminal-state")!;
const terminalSessionStorageKey = "convex-e2b-terminal-session";
const existingTerminalSession = sessionStorage.getItem(
  terminalSessionStorageKey,
);
const terminalSession = existingTerminalSession ?? crypto.randomUUID();
if (!existingTerminalSession) {
  sessionStorage.setItem(terminalSessionStorageKey, terminalSession);
}
const commandHistory: string[] = [];
let historyIndex = 0;
let commandBuffer = "";
let terminalBusy = false;

terminal.writeln(
  "  \x1b[38;2;255;61;61m✶ E2B sandbox\x1b[0m  connected through Convex",
);
terminal.writeln("  Type a command and press Enter.\r\n");
writePrompt();
terminal.focus();

terminal.onData((data) => {
  if (terminalBusy) return;
  if (data === "\r") {
    void executeTerminalCommand(commandBuffer);
    return;
  }
  if (data === "\u007f") {
    if (commandBuffer.length > 0) {
      commandBuffer = commandBuffer.slice(0, -1);
      terminal.write("\b \b");
    }
    return;
  }
  if (data === "\u0003") {
    terminal.write("^C\r\n");
    commandBuffer = "";
    writePrompt();
    return;
  }
  if (data === "\u000c") {
    terminal.clear();
    return;
  }
  if (data === "\x1b[A" || data === "\x1b[B") {
    navigateHistory(data === "\x1b[A" ? -1 : 1);
    return;
  }
  if (!data.startsWith("\x1b")) {
    commandBuffer += data;
    terminal.write(data);
  }
});

window.addEventListener("resize", () => fitAddon.fit());

async function executeTerminalCommand(command: string) {
  const trimmed = command.trim();
  commandBuffer = "";
  if (!trimmed) {
    terminal.write("\r\n");
    writePrompt();
    return;
  }
  if (trimmed === "clear") {
    terminal.clear();
    writePrompt();
    return;
  }
  if (!httpClient) {
    terminal.write("\r\n");
    terminal.writeln("  \x1b[31mVITE_CONVEX_URL is missing.\x1b[0m");
    writePrompt();
    return;
  }

  commandHistory.push(trimmed);
  historyIndex = commandHistory.length;
  terminalBusy = true;
  setTerminalState("executing");
  const stopLoading = startTerminalLoading();
  try {
    const result = await httpClient.action(api.sandbox.run, {
      scope: "web-terminal",
      key: terminalSession,
      command: trimmed,
    });
    stopLoading();
    if (result.stdout) terminal.write(indentOutput(result.stdout));
    if (result.stderr) {
      terminal.write(`\x1b[31m${indentOutput(result.stderr)}\x1b[0m`);
    }
    if (result.timedOut)
      terminal.writeln("  \x1b[33mCommand timed out.\x1b[0m");
    if (result.exitCode !== 0) {
      terminal.writeln(`  \x1b[31m[exit ${result.exitCode}]\x1b[0m`);
    }
  } catch (error) {
    stopLoading();
    terminal.writeln(
      `  \x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m`,
    );
  } finally {
    terminalBusy = false;
    setTerminalState("ready");
    writePrompt();
  }
}

function writePrompt() {
  terminal.write("  \x1b[38;2;255;61;61muser@e2b\x1b[0m:\x1b[34m~\x1b[0m$ ");
}

function navigateHistory(direction: number) {
  const next = Math.max(
    0,
    Math.min(commandHistory.length, historyIndex + direction),
  );
  if (next === historyIndex) return;
  terminal.write("\b \b".repeat(commandBuffer.length));
  historyIndex = next;
  commandBuffer = commandHistory[historyIndex] ?? "";
  terminal.write(commandBuffer);
}

function normalizeNewlines(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function indentOutput(value: string) {
  return normalizeNewlines(value)
    .split("\r\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\r\n");
}

function setTerminalState(state: "ready" | "executing") {
  terminalState.className = state;
  terminalState.lastChild!.textContent =
    state === "ready" ? " ready" : " executing";
}

function startTerminalLoading() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  terminal.write("\x1b[?25l");
  const draw = () => {
    terminal.write(`\x1b[s\r\x1b[38;2;255;61;61m${frames[frame]}\x1b[0m\x1b[u`);
    frame = (frame + 1) % frames.length;
  };
  draw();
  const timer = window.setInterval(draw, 80);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    terminal.write("\x1b[s\r \x1b[u\x1b[?25h\r\n");
  };
}

document
  .querySelector<HTMLFormElement>("#agent-form")!
  .addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const prompt = String(data.get("prompt")).trim();
    const userId = String(data.get("userId"));
    if (!prompt) return;
    void runAgentPrompt(form, { userId, prompt });
  });

document
  .querySelector<HTMLTextAreaElement>("#agent-form textarea")!
  .addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.shiftKey && !event.isComposing) {
      event.preventDefault();
      (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
    }
  });

document
  .querySelector<HTMLButtonElement>("#new-chat")!
  .addEventListener("click", () => {
    agentThreadId = undefined;
    chatLog.replaceChildren(createWelcomeMessage());
  });

type RunSnapshot = {
  run: {
    status: "queued" | "running" | "complete" | "error";
    text?: string;
    error?: string;
    threadId?: string;
  };
  events: Array<{
    _id: string;
    kind: "status" | "tool";
    name: string;
    input?: string;
    output?: string;
  }>;
} | null;

async function runAgentPrompt(
  form: HTMLFormElement,
  args: { userId: string; prompt: string },
) {
  if (!client || !httpClient) {
    appendError("VITE_CONVEX_URL is missing.");
    return;
  }

  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const textarea = form.elements.namedItem("prompt") as HTMLTextAreaElement;
  button.disabled = true;
  appendUserMessage(args.prompt);
  textarea.value = "";
  const assistant = appendAssistantMessage();

  let unsubscribe: (() => void) | undefined;
  const latest = { current: null as RunSnapshot };
  let resolveCompletion: (snapshot: RunSnapshot) => void = () => {};
  const completion = new Promise<RunSnapshot>((resolve) => {
    resolveCompletion = resolve;
  });
  let runId: Id<"agentRuns"> | undefined;
  try {
    runId = await httpClient.mutation(api.agentRuns.create, {
      ...args,
      threadId: agentThreadId,
    });
    unsubscribe = client.onUpdate(api.agentRuns.get, { runId }, (snapshot) => {
      latest.current = snapshot as RunSnapshot;
      renderAssistant(assistant, latest.current);
      if (latest.current?.run.status === "complete") {
        resolveCompletion(latest.current);
      }
    });
    const result = await httpClient.action(api.agent.prompt, {
      ...args,
      threadId: agentThreadId,
      runId,
    });
    agentThreadId = result.threadId;
    const completedSnapshot = await Promise.race([
      completion,
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), 2_000),
      ),
    ]);
    renderAssistant(
      assistant,
      completedSnapshot ?? {
        run: {
          status: "complete",
          text: result.text,
          threadId: result.threadId,
        },
        events: latest.current?.events ?? [],
      },
    );
  } catch (error) {
    if (runId && (await recoverAgentRun(runId, assistant))) return;
    renderAssistantError(
      assistant,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    unsubscribe?.();
    button.disabled = false;
    textarea.focus();
  }
}

async function recoverAgentRun(runId: Id<"agentRuns">, assistant: HTMLElement) {
  if (!httpClient) return false;

  // A request can lose its browser connection while the Convex action keeps
  // running. The run record is authoritative, so keep following it instead of
  // turning a transient transport error into a failed chat message.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const snapshot = (await httpClient.query(api.agentRuns.get, {
        runId,
      })) as RunSnapshot;
      if (snapshot) {
        renderAssistant(assistant, snapshot);
        if (snapshot.run.threadId) agentThreadId = snapshot.run.threadId;
        if (
          snapshot.run.status === "complete" ||
          snapshot.run.status === "error"
        ) {
          return true;
        }
      }
    } catch {
      // The deployment itself may be reconnecting; retry until the deadline.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  return false;
}

function appendUserMessage(text: string) {
  const article = document.createElement("article");
  article.className = "message user-message";
  const body = document.createElement("div");
  body.className = "message-body";
  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = "You";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  body.append(author, paragraph);
  article.append(body);
  chatLog.append(article);
  scrollChat();
}

function appendAssistantMessage() {
  const article = document.createElement("article");
  article.className = "message assistant-message";
  const avatar = createAgentAvatar("message-avatar");
  const body = document.createElement("div");
  body.className = "message-body";
  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = "E2B agent";
  const activity = document.createElement("div");
  activity.className = "agent-activity";
  const thinking = document.createElement("div");
  thinking.className = "thinking";
  thinking.textContent = "Starting…";
  body.append(author, activity, thinking);
  article.append(avatar, body);
  chatLog.append(article);
  scrollChat();
  return article;
}

function renderAssistant(article: HTMLElement, snapshot: RunSnapshot) {
  if (!snapshot) return;
  const body = article.querySelector<HTMLElement>(".message-body")!;
  const activity = article.querySelector<HTMLElement>(".agent-activity")!;
  article.querySelector(".assistant-answer")?.remove();
  activity.replaceChildren(
    ...snapshot.events.map((event) =>
      event.kind === "tool"
        ? createToolCard(event)
        : createStatusRow(event.name),
    ),
  );
  article.querySelector(".thinking")?.remove();

  if (snapshot.run.status === "queued" || snapshot.run.status === "running") {
    const thinking = document.createElement("div");
    thinking.className = "thinking";
    thinking.textContent =
      snapshot.run.status === "queued" ? "Starting…" : "Agent is working…";
    body.append(thinking);
  } else if (snapshot.run.status === "error") {
    renderAssistantError(article, snapshot.run.error ?? "The agent failed.");
  } else if (snapshot.run.text) {
    const paragraph = document.createElement("p");
    paragraph.className = "assistant-answer";
    paragraph.textContent = snapshot.run.text;
    body.append(paragraph);
  }
  scrollChat();
}

function createStatusRow(name: string) {
  const row = document.createElement("div");
  row.className = "status-row";
  const icon = document.createElement("span");
  icon.textContent = "✓";
  const label = document.createElement("span");
  label.textContent = name;
  row.append(icon, label);
  return row;
}

function createToolCard(event: NonNullable<RunSnapshot>["events"][number]) {
  const details = document.createElement("details");
  details.className = "tool-card";
  const summary = document.createElement("summary");
  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.textContent = toolIcon(event.name);
  const copy = document.createElement("span");
  copy.className = "tool-copy";
  const title = document.createElement("strong");
  title.textContent = friendlyToolName(event.name);
  const preview = document.createElement("small");
  preview.textContent = toolPreview(event);
  copy.append(title, preview);
  const check = document.createElement("span");
  check.className = "tool-check";
  check.textContent = "✓";
  summary.append(icon, copy, check);

  const detail = document.createElement("div");
  detail.className = "tool-detail";
  if (event.input) detail.append(createCodeBlock("Input", event.input));
  if (event.output) detail.append(createCodeBlock("Result", event.output));
  details.append(summary, detail);
  return details;
}

function createCodeBlock(label: string, value: string) {
  const wrapper = document.createElement("div");
  const title = document.createElement("span");
  title.textContent = label;
  const pre = document.createElement("pre");
  pre.textContent = value;
  wrapper.append(title, pre);
  return wrapper;
}

function renderAssistantError(article: HTMLElement, message: string) {
  article.querySelector(".thinking")?.remove();
  if (article.querySelector(".chat-error")) return;
  const paragraph = document.createElement("p");
  paragraph.className = "chat-error";
  paragraph.textContent = message;
  article.querySelector(".message-body")!.append(paragraph);
  scrollChat();
}

function appendError(message: string) {
  const article = appendAssistantMessage();
  renderAssistantError(article, message);
}

function createWelcomeMessage() {
  const template = document.createElement("template");
  template.innerHTML = `<article class="message assistant-message welcome-message"><span class="message-avatar" aria-hidden="true"><img src="/e2b-logo.svg" alt="" /></span><div class="message-body"><span class="message-author">E2B agent</span><p>I can inspect files, edit them, and run commands inside a persistent E2B sandbox. What should we work on?</p></div></article>`;
  return template.content.firstElementChild!;
}

function createAgentAvatar(className: string) {
  const avatar = document.createElement("span");
  avatar.className = className;
  avatar.setAttribute("aria-hidden", "true");
  const logo = document.createElement("img");
  logo.src = "/e2b-logo.svg";
  logo.alt = "";
  avatar.append(logo);
  return avatar;
}

function friendlyToolName(name: string) {
  return (
    {
      listFiles: "Listed files",
      readFile: "Read file",
      writeFile: "Wrote file",
      runCommand: "Ran command",
      getHost: "Opened preview",
    }[name] ?? name
  );
}

function toolIcon(name: string) {
  if (name === "runCommand") return ">_";
  if (name === "writeFile") return "+";
  if (name === "getHost") return "↗";
  return "◇";
}

function toolPreview(event: { input?: string; output?: string }) {
  const source = event.input ?? event.output ?? "Completed";
  const line = source
    .replace(/[{}"\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > 78 ? `${line.slice(0, 78)}…` : line;
}

function scrollChat() {
  requestAnimationFrame(() => {
    chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });
  });
}
