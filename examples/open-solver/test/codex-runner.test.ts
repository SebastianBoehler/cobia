import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCodexSolver, solverCodexConfig } from "../src/codex-runner";

async function* events() {
  yield { type: "thread.started", thread_id: "thread-123" } as const;
  yield { type: "turn.started" } as const;
  yield { type: "item.completed", item: {
    id: "message-1", type: "agent_message",
    text: JSON.stringify({ decisionJson: JSON.stringify({
      version: 1, decision: "abstain", reasonCode: "NO_PROFITABLE_ROUTE",
    }) }),
  } } as const;
  yield { type: "turn.completed", usage: {
    input_tokens: 10, cached_input_tokens: 2, cache_write_input_tokens: 0,
    output_tokens: 4, reasoning_output_tokens: 1,
  } } as const;
}

describe("Codex solver runner", () => {
  it("uses a required typed route MCP and disables nested shell execution", () => {
    const config = solverCodexConfig({ cwd: "/jobs/intent", intentPath: "/jobs/intent/intent.json",
      decisionPath: "/jobs/intent/decision.json", prompt: "solve" });

    expect(config.features).toMatchObject({ shell_tool: false, unified_exec: false });
    expect(config.mcp_servers.cobia_route).toMatchObject({
      required: true,
      default_tools_approval_mode: "approve",
      enabled_tools: ["capabilities", "solve", "exact_call"],
      args: expect.arrayContaining(["--intent", "/jobs/intent/intent.json"]),
    });
    expect(config.mcp_servers.cobia_route.env).not.toHaveProperty("REFERENCE_SOLVER_PRIVATE_KEY");
  });

  it("streams allowlisted lifecycle events and persists the structured decision", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-codex-runner-test-"));
    const startThread = vi.fn((_options: unknown) => ({
      runStreamed: vi.fn(async () => ({ events: events() })),
    }));
    const observed: object[] = [];

    const result = await runCodexSolver({
      job: { cwd, intentPath: join(cwd, "intent.json"),
        decisionPath: join(cwd, "decision.json"), prompt: "solve" },
      timeoutMs: 10_000,
      codex: { startThread },
      emit: (event) => { observed.push(event); },
    });

    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: cwd,
      sandboxMode: "workspace-write", approvalPolicy: "never",
    }));
    expect(startThread.mock.calls[0]![0]).not.toHaveProperty("model");
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
      timeoutMs: 10_000,
      codex: { startThread: () => ({ runStreamed: async () => ({ events: empty() }) }) },
      emit: vi.fn(),
    })).rejects.toThrow(/did not return/i);
  });
});
