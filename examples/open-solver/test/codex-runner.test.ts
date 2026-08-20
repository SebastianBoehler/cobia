import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCodexSolver } from "../src/codex-runner";

async function* events() {
  yield { type: "thread.started", thread_id: "thread-123" } as const;
  yield { type: "turn.started" } as const;
  yield { type: "item.completed", item: {
    id: "message-1", type: "agent_message",
    text: JSON.stringify({ version: 1, decision: "abstain", reasonCode: "NO_PROFITABLE_ROUTE" }),
  } } as const;
  yield { type: "turn.completed", usage: {
    input_tokens: 10, cached_input_tokens: 2, cache_write_input_tokens: 0,
    output_tokens: 4, reasoning_output_tokens: 1,
  } } as const;
}

describe("Codex solver runner", () => {
  it("streams allowlisted lifecycle events and persists the structured decision", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-codex-runner-test-"));
    const startThread = vi.fn(() => ({ runStreamed: vi.fn(async () => ({ events: events() })) }));
    const observed: object[] = [];

    const result = await runCodexSolver({
      job: { cwd, intentPath: join(cwd, "intent.json"),
        decisionPath: join(cwd, "decision.json"), prompt: "solve" },
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      timeoutMs: 10_000,
      codex: { startThread },
      emit: (event) => { observed.push(event); },
    });

    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-terra", workingDirectory: cwd,
      sandboxMode: "workspace-write", approvalPolicy: "never",
    }));
    expect(result).toMatchObject({ threadId: "thread-123", decision: {
      decision: "abstain", reasonCode: "NO_PROFITABLE_ROUTE",
    } });
    expect(JSON.parse(await readFile(join(cwd, "decision.json"), "utf8")))
      .toEqual(result.decision);
    expect(observed).toEqual([
      { event: "codex-thread-started", threadId: "thread-123" },
      { event: "codex-turn-started" },
      { event: "codex-message-completed" },
      { event: "codex-turn-completed", usage: {
        inputTokens: 10, cachedInputTokens: 2, outputTokens: 4, reasoningOutputTokens: 1,
      } },
    ]);
  });

  it("fails rather than falling back when Codex emits no canonical decision", async () => {
    async function* empty() {
      yield { type: "thread.started", thread_id: "thread-empty" } as const;
      yield { type: "turn.completed", usage: {
        input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0,
        output_tokens: 0, reasoning_output_tokens: 0,
      } } as const;
    }
    await expect(runCodexSolver({
      job: { cwd: "/tmp", intentPath: "/tmp/intent.json",
        decisionPath: "/tmp/decision.json", prompt: "solve" },
      model: "gpt-5.6-terra", reasoningEffort: "medium", timeoutMs: 10_000,
      codex: { startThread: () => ({ runStreamed: async () => ({ events: empty() }) }) },
      emit: vi.fn(),
    })).rejects.toThrow(/did not return/i);
  });
});
