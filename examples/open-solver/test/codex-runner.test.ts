import { mkdtemp, readFile } from "node:fs/promises";
import type { ThreadEvent } from "@openai/codex-sdk";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCodexSolver, solverCodexConfig } from "../src/codex-runner";

async function* events() {
  yield { type: "thread.started", thread_id: "thread-123" } as const;
  yield { type: "turn.started" } as const;
  yield { type: "item.started", item: {
    id: "search-1", type: "web_search", query: "X Layer USDG OKB pools",
  } } as const;
  yield { type: "item.started", item: {
    id: "solve-1", type: "mcp_tool_call", server: "cobia_route", tool: "solve",
    arguments: {}, status: "in_progress",
  } } as const;
  yield { type: "item.started", item: {
    id: "exact-1", type: "mcp_tool_call", server: "cobia_route", tool: "exact_call",
    arguments: {}, status: "in_progress",
  } } as const;
  yield { type: "item.completed", item: {
    id: "message-1", type: "agent_message",
    text: JSON.stringify({ decisionJson: JSON.stringify({
      version: 1, decision: "abstain", reasonCode: "NO_PROFITABLE_ROUTE",
    }) }, null, 2),
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
      enabled_tools: ["instructions", "intent", "capabilities", "solve", "plan", "replay", "exact_call"],
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
      { event: "solver-phase", phase: "researching" },
      { event: "solver-phase", phase: "constructing" },
      { event: "solver-phase", phase: "validating" },
      { event: "codex-message-completed" },
      { event: "codex-turn-completed", usage: {
        inputTokens: 10, cachedInputTokens: 2, outputTokens: 4, reasoningOutputTokens: 1,
      } },
    ]);
  });

  it("returns a submitted route plugin decision without waiting for another model turn", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-codex-plugin-submit-test-"));
    const hash = (byte: string) => `0x${byte.repeat(64)}`;
    const pluginDecision = {
      version: 1, decision: "submit", proposalKind: "transaction-program",
      program: { version: 1, programId: "550e8400-e29b-41d4-a716-446655440091",
        requestId: "550e8400-e29b-41d4-a716-446655440000", policyHash: hash("1"),
        owner: "0x1111111111111111111111111111111111111111", createdAt: 100,
        deadline: 200, maxEvidenceAgeSec: 300, stages: [{ id: "01-research",
          kind: "research", chainId: 196, dependsOn: [], plugin: "okx.dex@1",
          sourceHash: hash("2"), reasonCode: "ROUTE_BUILT" }] },
      providerArtifacts: { version: 1, artifacts: [] },
      provenance: { version: 1, runner: "agentic-plugin@1", dependencies: [],
        sources: [], commandHashes: [], generatedFiles: [] },
    };
    async function* pluginEvents() {
      yield { type: "thread.started", thread_id: "thread-plugin-submit" } as const;
      yield { type: "item.completed", item: { id: "solve-submit", type: "mcp_tool_call",
        server: "cobia_route", tool: "solve", arguments: {}, status: "completed",
        result: { content: [{ type: "text", text: JSON.stringify(pluginDecision) }],
          structured_content: null },
      } } as ThreadEvent;
    }

    const result = await runCodexSolver({
      job: { cwd, intentPath: join(cwd, "intent.json"),
        decisionPath: join(cwd, "decision.json"), prompt: "solve" },
      timeoutMs: 10_000,
      exploration: { riskLevel: "balanced", maxTurns: 2, maxTotalTokens: 1_000 },
      codex: { startThread: () => ({ runStreamed: async () => ({ events: pluginEvents() }) }) },
      emit: vi.fn(),
    });

    expect(result).toMatchObject({ decision: pluginDecision,
      usage: { turns: 1, totalTokens: 0, stopReason: "submitted" } });
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

  it("accepts the final structured envelope after provider-added prose", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-codex-provider-prose-test-"));
    async function* providerProse() {
      yield { type: "thread.started", thread_id: "thread-provider-prose" } as const;
      yield { type: "item.completed", item: {
        id: "message-provider-prose", type: "agent_message",
        text: "The supported solve returned no complete route.\n\n" +
          JSON.stringify({ decisionJson: JSON.stringify({
            version: 1, decision: "abstain", reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE",
          }) }),
      } } as const;
      yield { type: "turn.completed", usage: {
        input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0,
        output_tokens: 8, reasoning_output_tokens: 2,
      } } as const;
    }

    const result = await runCodexSolver({
      job: { cwd, intentPath: join(cwd, "intent.json"),
        decisionPath: join(cwd, "decision.json"), prompt: "solve" },
      timeoutMs: 10_000,
      exploration: { riskLevel: "conservative", maxTurns: 1, maxTotalTokens: 100 },
      codex: { startThread: () => ({
        runStreamed: async () => ({ events: providerProse() }),
      }) },
      emit: vi.fn(),
    });

    expect(result.decision).toEqual({
      version: 1, decision: "abstain", reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE",
    });
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

  it("recovers repeated noncanonical progress with an allowlisted-tool turn", async () => {
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const runStreamed = vi.fn(async (_prompt: string, options: { signal: AbortSignal }) => ({
        events: (async function* () {
          attempt += 1;
          if (attempt === 1) {
            yield { type: "thread.started", thread_id: "thread-tool-recovery" } as const;
            yield { type: "item.completed", item: { id: "progress-1", type: "agent_message",
              text: "The plugin abstained. I'll inspect the skills with bash." } } as const;
            yield { type: "item.completed", item: { id: "progress-2", type: "agent_message",
              text: "The shell call failed. Let me look up the schema." } } as const;
            await new Promise<void>((_resolve, reject) => options.signal.addEventListener(
              "abort", () => reject(new Error("aborted")), { once: true },
            ));
            return;
          }
          yield { type: "item.completed", item: { id: "recovered", type: "agent_message",
            text: JSON.stringify({ decisionJson: JSON.stringify({ version: 1,
              decision: "abstain", reasonCode: "NO_ROUTE_AFTER_RESEARCH",
            }) }),
          } } as const;
          yield { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 10,
            cache_write_input_tokens: 0, output_tokens: 4, reasoning_output_tokens: 1 } } as const;
        })(),
      }));
      const observed: object[] = [];
      const result = runCodexSolver({
        job: { cwd: "/tmp", intentPath: "/tmp/intent.json",
          decisionPath: "/tmp/decision.json", prompt: "solve" },
        timeoutMs: 10_000,
        exploration: { riskLevel: "opportunistic", maxTurns: 2, maxTotalTokens: 1_000 },
        codex: { startThread: () => ({ runStreamed }) },
        emit: (event) => { observed.push(event); },
      });

      await vi.advanceTimersByTimeAsync(10_000);
      await expect(result).resolves.toMatchObject({
        decision: { decision: "abstain", reasonCode: "NO_ROUTE_AFTER_RESEARCH" },
        usage: { turns: 1, totalTokens: 24, stopReason: "turn-limit" },
      });
      expect(runStreamed).toHaveBeenCalledTimes(2);
      expect(runStreamed.mock.calls[1]![0]).toContain("cobia_route.instructions");
      expect(runStreamed.mock.calls[1]![0]).toContain("Shell and direct file tools are unavailable");
      expect(observed).toContainEqual({ event: "codex-output-recovery",
        reason: "noncanonical-progress", nextTurn: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the last canonical abstention when a continuation times out", async () => {
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
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toMatchObject({
        decision: { decision: "abstain", reasonCode: "NO_VERIFIED_SWAP_ROUTE" },
        usage: { turns: 1, stopReason: "timeout" },
      });
      expect(runStreamed).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a terminal abstention when the first turn times out", async () => {
    vi.useFakeTimers();
    try {
      const result = runCodexSolver({
        job: { cwd: "/tmp", intentPath: "/tmp/intent.json",
          decisionPath: "/tmp/decision.json", prompt: "solve" },
        timeoutMs: 1_000,
        exploration: { riskLevel: "balanced", maxTurns: 1, maxTotalTokens: 1_000 },
        codex: { startThread: () => ({ runStreamed: async (_prompt, options) => ({
          events: (async function* () {
            yield { type: "thread.started", thread_id: "thread-first-timeout" } as const;
            await new Promise<void>((_resolve, reject) => {
              options.signal.addEventListener("abort", () => reject(new Error("aborted")),
                { once: true });
            });
          })(),
        }) }) },
        emit: vi.fn(),
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toMatchObject({
        decision: { decision: "abstain", reasonCode: "SOLVER_TIMEOUT" },
        usage: { turns: 0, stopReason: "timeout" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a terminal abstention when the host shuts down", async () => {
    const controller = new AbortController();
    const result = runCodexSolver({
      job: { cwd: "/tmp", intentPath: "/tmp/intent.json",
        decisionPath: "/tmp/decision.json", prompt: "solve" },
      timeoutMs: 10_000,
      signal: controller.signal,
      exploration: { riskLevel: "balanced", maxTurns: 1, maxTotalTokens: 1_000 },
      codex: { startThread: () => ({ runStreamed: async (_prompt, options) => ({
        events: (async function* () {
          yield { type: "thread.started", thread_id: "thread-shutdown" } as const;
          if (options.signal.aborted) throw new Error("aborted");
          await new Promise<void>((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new Error("aborted")),
              { once: true });
          });
        })(),
      }) }) },
      emit: vi.fn(),
    });

    controller.abort();
    await expect(result).resolves.toMatchObject({
      decision: { decision: "abstain", reasonCode: "SOLVER_SHUTDOWN" },
      usage: { stopReason: "shutdown" },
    });
  });
});
