import type { ThreadEvent, Usage } from "@openai/codex-sdk";

export type SolverCodexEvent =
  | { event: "codex-thread-started"; threadId: string }
  | { event: "codex-turn-started" }
  | { event: "codex-message-completed" }
  | { event: "codex-tool-completed"; tool: string; status: string }
  | { event: "solver-phase"; phase: "researching" | "constructing" | "validating" }
  | { event: "codex-exploration-continued"; reasonCode: string; nextTurn: number;
      turnsRemaining: number; tokensRemaining: number }
  | { event: "codex-output-recovery"; reason: "noncanonical-progress"; nextTurn: number }
  | { event: "codex-turn-completed"; usage: {
      inputTokens: number; cachedInputTokens: number;
      outputTokens: number; reasoningOutputTokens: number;
    } };

function usage(value: Usage) {
  return {
    inputTokens: value.input_tokens,
    cachedInputTokens: value.cached_input_tokens,
    outputTokens: value.output_tokens,
    reasoningOutputTokens: value.reasoning_output_tokens,
  };
}

export function publicCodexEvent(value: ThreadEvent): SolverCodexEvent | undefined {
  if (value.type === "thread.started") {
    return { event: "codex-thread-started", threadId: value.thread_id };
  }
  if (value.type === "turn.started") return { event: "codex-turn-started" };
  if (value.type === "turn.completed") {
    return { event: "codex-turn-completed", usage: usage(value.usage) };
  }
  if (value.type === "item.started" && value.item.type === "web_search") {
    return { event: "solver-phase", phase: "researching" };
  }
  if (value.type === "item.started" && value.item.type === "mcp_tool_call" &&
      value.item.server === "cobia_route") {
    if (value.item.tool === "solve") return { event: "solver-phase", phase: "constructing" };
    if (value.item.tool === "exact_call") return { event: "solver-phase", phase: "validating" };
  }
  if (value.type !== "item.completed") return undefined;
  if (value.item.type === "agent_message") return { event: "codex-message-completed" };
  if (value.item.type === "command_execution") {
    return { event: "codex-tool-completed", tool: "shell", status: value.item.status };
  }
  if (value.item.type === "mcp_tool_call") {
    return { event: "codex-tool-completed",
      tool: `${value.item.server}.${value.item.tool}`, status: value.item.status };
  }
  return undefined;
}
