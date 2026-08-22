import {
  commitment, OpenIntentPolicyV3Schema, solverRunClaimCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createOpenRunIntakeV1 } from "./run-intake";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const nowSec = 2_000_000_100;
const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Receive at least one output token", owner: account.address.toLowerCase(),
  executionChainIds: [196], nonce: hash("1"), createdAt: nowSec - 100,
  deadline: nowSec + 1_800, competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222", maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196,
    token: "0x3333333333333333333333333333333333333333", atomic: "1" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = {
  version: 1 as const, kind: "open-onchain" as const, requestId: policy.requestId,
  capturedAt: new Date((nowSec - 90) * 1_000).toISOString(),
  anchors: [{ chainId: 196 as const, blockNumber: "68461706", blockHash: hash("2") }],
};
const claim = { version: 1 as const, solverId: "alpha-solver", intentId: policy.requestId,
  revision: 1, snapshotHash: commitment(snapshot), nonce: hash("5"),
  issuedAt: nowSec - 5, expiresAt: nowSec + 120 };

async function signed(signer = account, value = claim) {
  return { claim: value, signature: await signer.signMessage({
    message: { raw: solverRunClaimCommitmentV1(value) },
  }) };
}

describe("open solver run intake", () => {
  it("starts an operator-signed run at the frozen X Layer anchor", async () => {
    const create = vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440092" }));
    const start = vi.fn(async () => ({ state: "running" as const }));
    const intake = createOpenRunIntakeV1({
      intents: { get: async () => ({ policy, state: "collecting" }) },
      snapshots: { get: async () => ({ snapshot, snapshotHash: commitment(snapshot) }) },
      profiles: { identity: async () => ({ operatorKind: "community",
        attestationAddress: account.address.toLowerCase() }) },
      runs: { create, start }, nowSec: () => nowSec,
    });

    await expect(intake.start(await signed())).resolves.toEqual({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 1, state: "running",
    });
    expect(create).toHaveBeenCalledWith({ intentId: policy.requestId, solverId: "alpha-solver",
      revision: 1, blockNumber: "68461706", blockHash: hash("2") });
    expect(start).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440092");
  });

  it("rejects signature and snapshot drift before creating a run", async () => {
    const create = vi.fn();
    const intake = createOpenRunIntakeV1({
      intents: { get: async () => ({ policy, state: "collecting" }) },
      snapshots: { get: async () => ({ snapshot, snapshotHash: commitment(snapshot) }) },
      profiles: { identity: async () => ({ operatorKind: "community",
        attestationAddress: account.address.toLowerCase() }) },
      runs: { create, start: vi.fn() }, nowSec: () => nowSec,
    });
    const wrong = privateKeyToAccount(`0x${"22".repeat(32)}`);

    await expect(intake.start(await signed(wrong))).rejects.toThrow(/signature/i);
    await expect(intake.start(await signed(account, { ...claim, snapshotHash: hash("9") })))
      .rejects.toThrow(/snapshot/i);
    expect(create).not.toHaveBeenCalled();
  });
});
