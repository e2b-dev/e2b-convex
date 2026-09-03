import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { E2B } from "@e2b/convex";
import { stepCountIs } from "ai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { components, internal } from "./_generated/api";

const sandboxes = new E2B(components.e2b, { timeoutMs: 10 * 60_000 });

export const prompt = action({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    prompt: v.string(),
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const emit = async (
      name: string,
      event?: { kind?: "status" | "tool"; input?: string; output?: string },
    ) => {
      if (!args.runId) return;
      await ctx.runMutation(internal.agentRuns.addEvent, {
        runId: args.runId,
        kind: event?.kind ?? "status",
        name,
        ...(event?.input ? { input: event.input } : {}),
        ...(event?.output ? { output: event.output } : {}),
      });
    };

    if (args.runId) {
      await ctx.runMutation(internal.agentRuns.update, {
        runId: args.runId,
        status: "running",
      });
    }

    try {
      await emit(args.threadId ? "Continuing conversation" : "Creating thread");
      const threadAgent = new Agent(components.agent, {
        name: "E2B coding agent",
        languageModel: openai("gpt-5-mini"),
      });
      const threadId =
        args.threadId ??
        (await threadAgent.createThread(ctx, { userId: args.userId })).threadId;

      if (args.runId) {
        await ctx.runMutation(internal.agentRuns.update, {
          runId: args.runId,
          threadId,
        });
      }

      await emit("Connecting to E2B sandbox");
      const { sandboxId } = await sandboxes.getOrCreate(ctx, {
        scope: args.userId,
        key: threadId,
      });
      if (args.runId) {
        await ctx.runMutation(internal.agentRuns.update, {
          runId: args.runId,
          sandboxId,
        });
      }
      await emit("Sandbox ready");
      const codingAgent = new Agent(components.agent, {
        name: "E2B coding agent",
        languageModel: openai("gpt-5-mini"),
        tools: sandboxes.agentTools({
          scope: ({ userId }) => userId,
          key: ({ threadId }) => threadId,
          sandboxId,
          command: { maxOutputBytes: 8 * 1024 },
          tools: {
            runCommand: {},
            readFile: {},
            writeFile: {},
            listFiles: {},
          },
        }),
      });
      const result = await codingAgent.generateText(
        ctx,
        { userId: args.userId, threadId },
        {
          prompt: args.prompt,
          instructions:
            "Work autonomously in the sandbox, but keep tool output concise. Use targeted commands, head, tail, or filters instead of printing large files. When reading a file, request only the portion you need and set maxBytes to at most 12000. Always finish with a short user-facing summary after using tools.",
          stopWhen: stepCountIs(20),
          onStepEnd: async (step) => {
            for (const call of step.toolCalls) {
              const result = step.toolResults.find(
                (candidate) => candidate.toolCallId === call.toolCallId,
              );
              await emit(call.toolName, {
                kind: "tool",
                input: summarize(call.input),
                output: result ? summarize(result.output) : "Completed",
              });
            }
          },
        },
        {
          contextOptions: {
            recentMessages: 12,
            excludeToolMessages: true,
          },
        },
      );
      const text =
        result.text.trim() ||
        "Done — the requested sandbox operations completed. See the tool results above.";
      if (args.runId) {
        await ctx.runMutation(internal.agentRuns.update, {
          runId: args.runId,
          status: "complete",
          text,
        });
      }
      return { threadId, text };
    } catch (error) {
      if (args.runId) {
        await ctx.runMutation(internal.agentRuns.update, {
          runId: args.runId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },
});

function summarize(value: unknown): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) return "Completed";
  return text.length > 1_200 ? `${text.slice(0, 1_200)}\n…` : text;
}
