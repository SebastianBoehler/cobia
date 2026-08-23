import {
  solverDecisionClaimCommitmentV1, type SolverDecisionClaimV1,
} from "@cobia/domain";
import { recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { IntentAttempts } from "../src/job-control";
import { handleIntentError } from "../src/worker-error";

describe("solver worker errors", () => {
  it("publishes a terminal abstention when the final retry fails", async () => {
    const state = {};
    const attempts = new IntentAttempts(state, { maxAttempts: 2, retryBaseMs: 30_000 });
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const submitDecision = vi.fn(async (_input: {
      claim: SolverDecisionClaimV1;
      signature: Hex;
      decision: unknown;
    }) => ({ state: "abstained" as const }));
    const persist = vi.fn(async () => undefined);
    const intent = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      snapshotHash: `0x${"22".repeat(32)}`,
      competitionClosesAt: 300,
    };
    const error = Object.assign(new Error("rejected"), { code: "INVALID_DECISION" });

    await expect(handleIntentError({ error, intent, attempts, maxAttempts: 2,
      client: { submitDecision }, account, solverId: "alpha-solver", persist,
      nowMs: 1_000 })).resolves.toMatchObject({ retryable: true, attempts: 1 });
    expect(submitDecision).not.toHaveBeenCalled();

    await expect(handleIntentError({ error, intent, attempts, maxAttempts: 2,
      client: { submitDecision }, account, solverId: "alpha-solver", persist,
      nowMs: 31_000 })).resolves.toMatchObject({
      retryable: false, attempts: 2, terminalState: "abstained",
    });

    const value = submitDecision.mock.calls[0]![0];
    expect(value.decision).toEqual({
      version: 1, decision: "abstain", reasonCode: "INVALID_DECISION",
    });
    expect(value.claim).toMatchObject({
      version: 1, solverId: "alpha-solver", intentId: intent.id, revision: 1,
      snapshotHash: intent.snapshotHash, issuedAt: 31, expiresAt: 271,
    });
    await expect(recoverMessageAddress({
      message: { raw: solverDecisionClaimCommitmentV1(value.claim) },
      signature: value.signature,
    })).resolves.toBe(account.address);
    expect(state).toEqual({
      [intent.id]: { state: "abstained", revision: 1, attempts: 2 },
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
