import { describe, expect, it, vi } from "vitest";
import { runSolverCycle, watchSolverIntents } from "../src/harness";

const intent = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  policy: { requestId: "550e8400-e29b-41d4-a716-446655440000" },
  policyHash: `0x${"11".repeat(32)}`,
};

describe("open solver harness", () => {
  it("lets each strategy abstain explicitly without inventing a program", async () => {
    const solve = vi.fn(async () => ({
      version: 1, decision: "abstain", reasonCode: "NO_VERIFIABLE_ROUTE",
    }));
    const results = await runSolverCycle({
      client: { listIntents: vi.fn(async () => ({ observedAt: 2_000_000_000, intents: [intent] })) } as never,
      solve,
    });

    expect(results).toEqual([{ intentId: intent.id, decision: {
      version: 1, decision: "abstain", reasonCode: "NO_VERIFIABLE_ROUTE",
    } }]);
    expect(solve).toHaveBeenCalledWith(intent);
  });

  it("rejects malformed strategy output instead of silently falling back", async () => {
    await expect(runSolverCycle({
      client: { listIntents: vi.fn(async () => ({ observedAt: 2_000_000_000, intents: [intent] })) } as never,
      solve: vi.fn(async () => ({ decision: "skip" })),
    })).rejects.toThrow();
  });

  it("dispatches later intent events while an earlier solver job is still running", async () => {
    const controller = new AbortController();
    let releaseFirst!: () => void;
    const firstJob = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondIntent = { ...intent, id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" };
    const listIntents = vi.fn()
      .mockResolvedValueOnce({ observedAt: 2_000_000_000, intents: [intent] })
      .mockResolvedValue({ observedAt: 2_000_000_001, intents: [intent, secondIntent] });
    const started: string[] = [];

    const watching = watchSolverIntents({
      client: { listIntents } as never,
      pollIntervalMs: 1,
      signal: controller.signal,
      onError: vi.fn(),
      async onIntent(next) {
        started.push(next.id);
        if (next.id === intent.id) return firstJob;
        controller.abort();
        releaseFirst();
      },
    });

    await watching;
    expect(started).toEqual([intent.id, secondIntent.id]);
    expect(listIntents).toHaveBeenCalledTimes(2);
  });

  it("defaults to a two-second poll and exits after a sustained exchange outage", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const listIntents = vi.fn().mockRejectedValue(new Error("offline"));
    const watching = watchSolverIntents({
      client: { listIntents } as never,
      signal: controller.signal,
      onError: vi.fn(),
      onIntent: vi.fn(),
      maxConsecutivePollFailures: 2,
    });
    const rejected = expect(watching).rejects.toThrow(/consecutive failures/i);

    try {
      await vi.advanceTimersByTimeAsync(1_999);
      expect(listIntents).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
});
