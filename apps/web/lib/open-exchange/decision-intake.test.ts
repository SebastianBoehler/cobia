import {
  commitment,
  OpenIntentPolicyV3Schema,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolverDecisionReplayError } from "../db/solver-decision-claims";
import { createOpenDecisionIntakeV1 } from "./decision-intake";

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
const program = {
  version: 2 as const, kind: "general-onchain" as const, requestId: policy.requestId,
  chainId: 196 as const, policyHash: hash("3"), manifestHash: hash("4"), owner: policy.owner,
  executor: "0x4444444444444444444444444444444444444444",
  pinnedBlock: { number: snapshot.anchors[0]!.blockNumber, hash: snapshot.anchors[0]!.blockHash },
  deadline: nowSec + 200, nonce: policy.nonce,
  input: { token: policy.inputs[0]!.token, atomic: "10" },
  actions: [{ capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0" as const,
    parameters: { asset: policy.inputs[0]!.token, amountAtomic: "10" } }],
  balanceConstraints: [{ kind: "minimumIncrease" as const,
    token: policy.outcomes[0]!.kind === "minimum-increase" ? policy.outcomes[0].token
      : policy.inputs[0]!.token, atomic: "1" }], predicates: [],
  objective: { kind: "satisfy" as const },
};
const decision = {
  version: 1 as const, decision: "submit" as const, proposalKind: "capability-v2" as const, program,
  evidence: { version: 2 as const, kind: "general-onchain" as const,
    programHash: commitment(program), chainId: 196 as const,
    blockNumber: snapshot.anchors[0]!.blockNumber, blockHash: snapshot.anchors[0]!.blockHash,
    traceHash: hash("6"), stateDiffHash: hash("7"), eventsHash: hash("8"),
    balanceDeltas: [{ token: policy.outcomes[0]!.kind === "minimum-increase"
      ? policy.outcomes[0].token : policy.inputs[0]!.token, account: policy.owner,
      beforeAtomic: "0", afterAtomic: "2" }],
    deployments: [], observations: [] },
  provenance: { version: 1 as const, runner: "alpha@1", dependencies: [], sources: [],
    commandHashes: [], generatedFiles: [] },
};

function claim(decisionHash = commitment(decision)) {
  return { version: 1 as const, solverId: "alpha-solver", intentId: policy.requestId, revision: 1,
    decisionHash, snapshotHash: commitment(snapshot), nonce: hash("5"),
    issuedAt: nowSec - 5, expiresAt: nowSec + 120 };
}

const mocks = {
  consume: vi.fn(), createRun: vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440092" })),
  startRun: vi.fn(), completeRun: vi.fn(), abstainRun: vi.fn(), failRun: vi.fn(),
  append: vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440093" })),
  appendArtifact: vi.fn(), resolve: vi.fn(), verify: vi.fn(),
};

function intake(overrides: Record<string, unknown> = {}) {
  return createOpenDecisionIntakeV1({
    intents: { get: async () => ({ policy, state: "collecting" }) },
    snapshots: { get: async () => ({ snapshot, snapshotHash: commitment(snapshot) }) },
    profiles: { identity: async () => ({ id: "alpha-solver", operatorKind: "community",
      attestationAddress: account.address.toLowerCase(), declaredCapabilities: ["aave-v3.supply@1"] }) },
    claims: { consume: mocks.consume },
    runs: { create: mocks.createRun, start: mocks.startRun, complete: mocks.completeRun,
      abstain: mocks.abstainRun, fail: mocks.failRun },
    submissions: { append: mocks.append, appendArtifact: mocks.appendArtifact, resolve: mocks.resolve },
    verify: mocks.verify,
    nowSec: () => nowSec,
    ...overrides,
  });
}

async function signed(value = claim(), payload: unknown = decision) {
  return { claim: value, decision: payload, signature: await account.signMessage({
    message: { raw: solverDecisionClaimCommitmentV1(value) },
  }) };
}

describe("open solver decision intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ accepted: true, errorCodes: [], objective: {
      version: 1, kind: "atomic-value", direction: "maximize", atomic: "2",
    } });
  });

  it("attests a signed proposal only after independent acceptance", async () => {
    await expect(intake().submit(await signed())).resolves.toMatchObject({
      intentId: policy.requestId, solverId: "alpha-solver", revision: 1,
      state: "accepted", submissionId: "550e8400-e29b-41d4-a716-446655440093",
    });
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ policy, snapshot,
      runId: "550e8400-e29b-41d4-a716-446655440092", proposalKind: "capability-v2" }));
    expect(mocks.resolve.mock.calls.map((call) => call[1])).toEqual(["verified", "attested"]);
    expect(mocks.appendArtifact.mock.calls.map((call) => call[1])).toEqual([
      "snapshot", "program", "evidence", "provenance", "verdict", "objective",
    ]);
  });

  it("records a signed abstention without creating a proposal", async () => {
    const abstention = { version: 1 as const, decision: "abstain" as const, reasonCode: "NO_ROUTE" };
    const abstentionClaim = claim(commitment(abstention));
    await expect(intake().submit(await signed(abstentionClaim, abstention)))
      .resolves.toMatchObject({ state: "abstained" });
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.abstainRun).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440092", "NO_ROUTE",
    );
    expect(mocks.append).not.toHaveBeenCalled();
  });

  it("rejects signature, decision, and snapshot drift before consuming the nonce", async () => {
    const wrong = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const validClaim = claim();
    const signature = await wrong.signMessage({ message: { raw: solverDecisionClaimCommitmentV1(validClaim) } });
    await expect(intake().submit({ claim: validClaim, decision, signature })).rejects.toThrow(/signature/i);
    await expect(intake().submit(await signed({ ...validClaim, decisionHash: hash("9") })))
      .rejects.toThrow(/decision commitment/i);
    await expect(intake().submit(await signed({ ...validClaim, snapshotHash: hash("9") })))
      .rejects.toThrow(/snapshot/i);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("surfaces replay protection without starting verifier work", async () => {
    mocks.consume.mockRejectedValueOnce(new SolverDecisionReplayError("consumed"));
    await expect(intake().submit(await signed())).rejects.toBeInstanceOf(SolverDecisionReplayError);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
