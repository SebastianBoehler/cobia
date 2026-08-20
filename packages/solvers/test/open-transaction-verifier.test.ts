import { commitment, type OpenIntentPolicyV3, type OpenIntentSnapshotV1 } from "@cobia/domain";
import { keccak256 } from "viem";
import { describe, expect, it, vi } from "vitest";
import { TransactionProgramEvidenceV1Schema, verifyOpenTransactionProgramV1 } from "../src";

const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const calldata = "0x12345678" as const;

const policy: OpenIntentPolicyV3 = {
  version: 3, kind: "open-onchain", requestId: "f0ef2458-bfca-4db8-beb7-160f5e37f337",
  displayGoal: "Turn 10 input tokens into at least 20 output tokens", owner,
  executionChainIds: [196], nonce: hash("1"), createdAt: 1_786_900_000, deadline: 1_786_901_800,
  competition: { closesAt: 1_786_900_300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: inputToken, maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196, token: outputToken, atomic: "20" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
};
const snapshot: OpenIntentSnapshotV1 = {
  version: 1, kind: "open-onchain", requestId: policy.requestId,
  capturedAt: "2026-08-20T10:00:00.000Z",
  anchors: [{ chainId: 196, blockNumber: "68451205", blockHash: hash("2") }],
};
const program = {
  version: 1, programId: "550e8400-e29b-41d4-a716-446655440091", requestId: policy.requestId,
  policyHash: commitment(policy), owner, createdAt: 1_786_900_100, deadline: policy.deadline,
  maxEvidenceAgeSec: 300,
  stages: [{ id: "01-solve", kind: "wallet-transaction", chainId: 196, dependsOn: [],
    provider: "evm.raw@1", quoteHash: hash("3"), responseHash: hash("4"),
    fetchedAt: 1_786_900_100, expiresAt: 1_786_900_400, sender: owner, recipient: owner,
    input: { token: inputToken, atomic: "10" },
    output: { chainId: 196, token: outputToken, minimumAtomic: "20" },
    approval: { token: inputToken, spender: target, maximumAtomic: "10" },
    transaction: { target, selector: "0x12345678", dataHash: keccak256(calldata), valueAtomic: "0" },
    tools: ["custom-contract"] }],
};
const identities = [inputToken, outputToken, target].map((address, index) => ({
  address, runtimeCodeHash: hash(String(index + 6)),
}));
const simulation = {
  stageId: "01-solve", chainId: 196, blockNumber: "68451205", blockHash: hash("2"),
  transactionDataHash: keccak256(calldata), success: true, calldataBytes: 4, gasUsed: "300000", traceHash: hash("9"),
  stateDiffHash: hash("a"), eventsHash: hash("b"), completeAssetCoverage: true,
  assetDeltas: [
    { token: inputToken, account: owner, beforeAtomic: "10", afterAtomic: "0", deltaAtomic: "-10" },
    { token: outputToken, account: owner, beforeAtomic: "0", afterAtomic: "20", deltaAtomic: "20" },
  ],
  allowanceDeltas: [{ token: inputToken, owner, spender: target, beforeAtomic: "0", afterAtomic: "0" }],
  codeIdentities: identities,
};
const evidence = TransactionProgramEvidenceV1Schema.parse({
  version: 1, programHash: commitment(program), capturedAt: 1_786_900_100,
  simulations: [simulation],
});
const providerPayload = {
  version: 1, provider: "evm.raw@1", stageId: "01-solve",
  transaction: { chainId: 196, from: owner, to: target, data: calldata, valueAtomic: "0" },
};
const providerArtifacts = {
  version: 1,
  artifacts: [{
    stageId: "01-solve", provider: "evm.raw@1",
    payloadHash: commitment(providerPayload), payload: providerPayload,
  }],
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const selectedEvidence = (overrides.evidence ?? evidence) as typeof evidence;
  return {
    policy, snapshot, program, evidence: selectedEvidence, providerArtifacts,
    nowSec: 1_786_900_150,
    confirmAnchor: vi.fn(async () => true),
    getCodeHash: vi.fn(async (_chainId, address: string) =>
      identities.find((identity) => identity.address === address)?.runtimeCodeHash),
    verifyProviderStage: vi.fn(async () => ({
      accepted: true as const,
      calls: [{ to: target, data: calldata, value: "0x0" as const }],
    })),
    replay: vi.fn(async () => ({ reproduced: true, simulations: selectedEvidence.simulations })),
    ...overrides,
  };
}

describe("open transaction-program verifier", () => {
  it("accepts an unknown protocol solely from bounded complete outcome evidence", async () => {
    const result = await verifyOpenTransactionProgramV1(dependencies());
    expect(result).toMatchObject({
      accepted: true,
      programHash: evidence.programHash,
      stageAuthorizations: [{ stageId: "01-solve", calls: [{ to: target, data: calldata }] }],
      objective: { version: 1, kind: "atomic-value", direction: "maximize", atomic: "20" },
    });
  });

  it("rejects missing or independently rejected provider artifacts", async () => {
    expect(await verifyOpenTransactionProgramV1(dependencies({
      providerArtifacts: { version: 1, artifacts: [] },
    }))).toEqual({ accepted: false, errorCodes: ["PROVIDER_ARTIFACT_INVALID"] });
    expect(await verifyOpenTransactionProgramV1(dependencies({
      verifyProviderStage: vi.fn(async () => ({
        accepted: false as const, errorCodes: ["RAW_CALLDATA_MISMATCH"],
      })),
    }))).toEqual({ accepted: false, errorCodes: ["PROVIDER_VERIFICATION_FAILED"] });
  });

  it("rejects a matching output that also drains an undeclared asset", async () => {
    const drained = "0x5555555555555555555555555555555555555555";
    const unsafe = { ...evidence, simulations: [{ ...simulation, assetDeltas: [
      ...simulation.assetDeltas,
      { token: drained, account: owner, beforeAtomic: "100", afterAtomic: "0", deltaAtomic: "-100" },
    ] }] };
    expect(await verifyOpenTransactionProgramV1(dependencies({ evidence: unsafe })))
      .toEqual({ accepted: false, errorCodes: ["UNDECLARED_ASSET_DECREASE"] });
  });

  it("rejects residual approvals even when the balance outcome succeeds", async () => {
    const unsafe = { ...evidence, simulations: [{ ...simulation, allowanceDeltas: [{
      ...simulation.allowanceDeltas[0]!, afterAtomic: "10",
    }] }] };
    expect(await verifyOpenTransactionProgramV1(dependencies({ evidence: unsafe })))
      .toEqual({ accepted: false, errorCodes: ["ALLOWANCE_EXPANDED"] });
  });

  it("rejects changed code, reorged anchors, and spoofed replay evidence", async () => {
    const changed = dependencies({ getCodeHash: vi.fn(async () => hash("f")) });
    expect(await verifyOpenTransactionProgramV1(changed)).toMatchObject({ accepted: false });
    const reorged = dependencies({ confirmAnchor: vi.fn(async () => false) });
    expect(await verifyOpenTransactionProgramV1(reorged)).toMatchObject({ accepted: false });
    const spoofed = dependencies({ replay: vi.fn(async () => ({ reproduced: true, simulations: [] })) });
    expect(await verifyOpenTransactionProgramV1(spoofed)).toMatchObject({ accepted: false });
  });

  it("rejects a weak outcome, overspend, and forbidden target", async () => {
    const weak = { ...evidence, simulations: [{ ...simulation, assetDeltas: [
      simulation.assetDeltas[0]!,
      { ...simulation.assetDeltas[1]!, afterAtomic: "19", deltaAtomic: "19" },
    ] }] };
    expect(await verifyOpenTransactionProgramV1(dependencies({ evidence: weak })))
      .toMatchObject({ accepted: false });
    expect(await verifyOpenTransactionProgramV1(dependencies({
      policy: { ...policy, inputs: [{ ...policy.inputs[0]!, maximumAtomic: "9" }] },
    }))).toMatchObject({ accepted: false });
    expect(await verifyOpenTransactionProgramV1(dependencies({
      policy: { ...policy, forbiddenTargets: [target] },
    }))).toMatchObject({ accepted: false });
  });
});
