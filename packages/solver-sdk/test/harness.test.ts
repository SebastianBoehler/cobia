import { describe, expect, it, vi } from "vitest";
import { runSolverCycle } from "../src/harness";

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
});
