import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.stubEnv("COBIA_MODEL", "deepseek/deepseek-v4-flash-0731");
  });

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
      exploration: { riskLevel: "balanced", maxTurns: 1, maxTotalTokens: 1000 },
      codex: { startThread },
      emit: (event) => { observed.push(event); },
    });

    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({
      model: "deepseek/deepseek-v4-flash-0731", workingDirectory: cwd,
      sandboxMode: "workspace-write", approvalPolicy: "never",
    }));
    expect(result).toMatchObject({ threadId: "thread-123", usage: {
      turns: 1, totalTokens: 14, stopReason: "turn-limit",
    }, decision: {
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
      exploration: { riskLevel: "conservative", maxTurns: 1, maxTotalTokens: 100 },
      codex: { startThread: () => ({ runStreamed: async () => ({ events: empty() }) }) },
      emit: vi.fn(),
    })).rejects.toThrow(/did not return/i);
  });

  it("continues an abstention until the configured exploration turn budget is spent", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-codex-exploration-test-"));
    let turn = 0;
    const runStreamed = vi.fn(async (_prompt: string) => ({ events: (async function* () {
      turn += 1;
      if (turn === 1) yield { type: "thread.started", thread_id: "thread-explore" } as const;
      yield { type: "turn.started" } as const;
      yield { type: "item.completed", item: { id: `message-${turn}`, type: "agent_message",
        text: JSON.stringify({ decisionJson: JSON.stringify({ version: 1,
          decision: "abstain", reasonCode: turn === 1 ? "NO_VERIFIED_SWAP_ROUTE" :
            "NO_ROUTE_AFTER_RESEARCH",
        }) }),
      } } as const;
      yield { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 50,
        cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 4 } } as const;
    })() }));
    const observed: object[] = [];

    const result = await runCodexSolver({
      job: { cwd, intentPath: join(cwd, "intent.json"),
        decisionPath: join(cwd, "decision.json"), prompt: "solve" },
      timeoutMs: 10_000,
      exploration: { riskLevel: "opportunistic", maxTurns: 2, maxTotalTokens: 1000 },
      codex: { startThread: () => ({ runStreamed }) },
      emit: (event) => { observed.push(event); },
    });

    expect(runStreamed).toHaveBeenCalledTimes(2);
    expect(runStreamed.mock.calls[1]![0]).toContain("market inefficiencies");
    expect(observed).toContainEqual(expect.objectContaining({
      event: "codex-exploration-continued", reasonCode: "NO_VERIFIED_SWAP_ROUTE", nextTurn: 2,
    }));
    expect(result).toMatchObject({ decision: { reasonCode: "NO_ROUTE_AFTER_RESEARCH" },
      usage: { turns: 2, totalTokens: 220, stopReason: "turn-limit" } });
  });

  it("shares one timeout across continuation turns", async () => {
    vi.useFakeTimers();
    try {
      let turn = 0;
      const runStreamed = vi.fn(async (_prompt: string, options: { signal: AbortSignal }) => ({
        events: (async function* () {
          turn += 1;
          if (turn === 1) {
            yield { type: "thread.started", thread_id: "thread-timeout" } as const;
            await new Promise((resolve) => setTimeout(resolve, 600));
            yield { type: "item.completed", item: { id: "message-timeout", type: "agent_message",
              text: JSON.stringify({ decisionJson: JSON.stringify({ version: 1,
                decision: "abstain", reasonCode: "NO_VERIFIED_SWAP_ROUTE",
              }) }),
            } } as const;
            yield { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0,
              cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } } as const;
            return;
          }
          await new Promise<void>((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        })(),
      }));
      const result = runCodexSolver({
        job: { cwd: "/tmp", intentPath: "/tmp/intent.json",
          decisionPath: "/tmp/decision.json", prompt: "solve" },
        timeoutMs: 1_000,
        exploration: { riskLevel: "opportunistic", maxTurns: 2, maxTotalTokens: 1_000 },
        codex: { startThread: () => ({ runStreamed }) },
        emit: vi.fn(),
      });
      const rejection = expect(result).rejects.toThrow("aborted");

      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
      expect(runStreamed).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
