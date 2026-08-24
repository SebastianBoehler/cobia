import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  commitment,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COBIA_EXECUTOR_V4_ABI } from "../execution-v4/abi";
import { buildAuthorizationV4, type ExecutionProgramV4 } from "../execution-v4/commitment";
import { createOpenDecisionIntakeV1 } from "./decision-intake";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const nowSec = 2_000_000_100;
let currentTimeSec = nowSec;
const inputIdentity = AssetIdentityEvidenceV1Schema.parse({
  version: 1, chainId: 1, token: inputToken, runtimeCodeHash: hash("1"),
  proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 },
  blockNumber: "123", blockHash: hash("2"), capturedAtSec: nowSec - 30,
  expiresAtSec: nowSec + 120,
});
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({
  ...inputIdentity, token: outputToken, runtimeCodeHash: hash("3"),
});
const valuation = AssetValuationEvidenceV1Schema.parse({
  version: 1, assetIdentityHash: commitment(inputIdentity),
  referenceAsset: { chainId: 1, token: outputToken }, inputAtomic: "100",
  conservativeValueUsdE8: "100000000", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.market", version: 1 }, outputAtomic: "100",
    referenceValueUsdE8: "100000000", liquidityUsdE8: "1000000000", priceImpactBps: 0,
    fetchedAtSec: nowSec - 30, expiresAtSec: nowSec + 120, quoteHash: hash("4") }],
  capturedAtSec: nowSec - 30, expiresAtSec: nowSec + 120,
});
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.market", version: 1 }, chainId: 1 as const, target,
  runtimeCodeHash: hash("5"), selectors: ["0x12345678"], approvalSpenders: [] }] };
const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap arbitrary assets", owner: account.address.toLowerCase(),
  sourceChainId: 1, destinationChainId: 1, nonce: hash("6"), createdAt: nowSec - 100,
  deadline: nowSec + 600, competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: commitment(manifest),
  inputIdentityHash: commitment(inputIdentity), inputValuationHash: commitment(valuation),
  input: { chainId: 1, token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000" },
  outputs: [{ chainId: 1, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }], allowedAdapters: [{ id: "okx.market", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 128,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 100, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = GeneralAssetProgramV1Schema.parse({
  version: 1, kind: "general-asset-program", policyHash: commitment(policy),
  manifestHash: policy.manifestHash, canonicalProgramHash: hash("7"), owner: policy.owner,
  deadline: nowSec + 200,
  identityEvidenceHashes: [commitment(inputIdentity), commitment(outputIdentity)].sort(),
  valuationEvidenceHashes: [commitment(valuation)],
  stages: [{ stageId: hash("8"), index: 0, chainId: 1, predecessorStageId: null,
    adapter: { id: "okx.market", version: 1 }, target, targetRuntimeCodeHash: hash("5"),
    calldata: "0x12345678", nativeValueAtomic: "0",
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: commitment(inputIdentity), valuationEvidenceHash: commitment(valuation) },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "90",
      identityEvidenceHash: commitment(outputIdentity) }], approvals: [],
    refundTokens: [inputToken, outputToken].sort(), finality: { confirmations: 12 },
    delivery: { kind: "none" } }],
  finalOutput: { chainId: 1, token: outputToken, minimumAtomic: "90" },
});
const decision = { version: 1 as const, decision: "submit" as const,
  proposalKind: "general-asset-program" as const, program,
  evidence: { version: 1 as const, kind: "general-asset-evidence" as const,
    identities: [inputIdentity, outputIdentity],
    valuations: [valuation], manifest }, provenance: { version: 1 as const,
    runner: "general-solver@1", dependencies: [], sources: [], commandHashes: [], generatedFiles: [] } };
const executionProgram: ExecutionProgramV4 = {
  policyHash: program.policyHash, manifestHash: program.manifestHash,
  canonicalProgramHash: program.canonicalProgramHash,
  inputIdentityEvidenceHash: commitment(inputIdentity),
  outputIdentityEvidenceHash: commitment(outputIdentity), valuationEvidenceHash: commitment(valuation),
  stageHash: commitment(program.stages[0]!), simulationHash: hash("d"),
  pinnedBlockNumber: 124n, pinnedBlockHash: hash("b"), sourceChainId: 1n,
  owner: policy.owner, inputToken, outputToken, inputAmount: 100n, inputUsdE8: 100000000n,
  deadline: BigInt(program.deadline), nonce: hash("e"), refundTokens: [inputToken, outputToken],
  calls: [{ adapterKey: hash("f"), target, targetRuntimeCodeHash: hash("a"),
    value: 0n, gasLimit: 300_000,
    approvals: [], data: "0x12345678" }],
  constraints: [{ token: outputToken, kind: 1, minimum: 90n }],
};
const verifierAuthorization = buildAuthorizationV4(executionProgram, target);
const verifierSignature = `0x${"12".repeat(65)}` as const;
const execution = { version: 4 as const, kind: "general-asset-execution" as const,
  programId: program.canonicalProgramHash, owner: policy.owner, deadline: program.deadline,
  finalOutput: program.finalOutput, stages: [{ stageId: program.stages[0]!.stageId,
    ordinal: 0, chainId: 1 as const, predecessorStageId: null, inputToken,
    requiredConfirmations: 12, transaction: { chainId: 1 as const, from: policy.owner,
      to: target, value: "0x0" as const, data: encodeFunctionData({ abi: COBIA_EXECUTOR_V4_ABI,
        functionName: "execute", args: [executionProgram, verifierAuthorization, verifierSignature] }) }, expectedLogs: [],
    delivery: { kind: "none" as const }, evidenceHash: hash("a") }] };
const authorization = [{ version: 4 as const, stageIndex: 0, chainId: 1 as const,
  executor: target, executionCommitment: verifierAuthorization.executionCommitment,
  evidenceHash: hash("a"), signature: verifierSignature }];

const mocks = {
  snapshots: vi.fn(), consume: vi.fn(),
  createRun: vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440092" })),
  startRun: vi.fn(), completeRun: vi.fn(), failRun: vi.fn(), abstainRun: vi.fn(),
  append: vi.fn(async () => ({ id: "550e8400-e29b-41d4-a716-446655440093" })),
  appendArtifact: vi.fn(), resolve: vi.fn(), verify: vi.fn(),
};

function claim(snapshotHash = commitment(decision.evidence)) {
  return { version: 1 as const, solverId: "general-solver", intentId: policy.requestId,
    revision: 1, decisionHash: commitment(decision), snapshotHash, nonce: hash("9"),
    issuedAt: nowSec - 5, expiresAt: nowSec + 120 };
}

function intake(declaredCapabilities = ["general-asset@1"]) {
  return createOpenDecisionIntakeV1({
    intents: { get: async () => ({ policy, state: "collecting",
      generalAssetEvidenceHash: commitment(decision.evidence),
      generalAssetEvidence: decision.evidence }) },
    snapshots: { get: mocks.snapshots },
    profiles: { identity: async () => ({ id: "general-solver", operatorKind: "community",
      attestationAddress: account.address.toLowerCase(), declaredCapabilities }) },
    claims: { consume: mocks.consume },
    runs: { create: mocks.createRun, start: mocks.startRun, complete: mocks.completeRun,
      abstain: mocks.abstainRun, fail: mocks.failRun },
    submissions: { append: mocks.append, appendArtifact: mocks.appendArtifact, resolve: mocks.resolve },
    verify: mocks.verify, nowSec: () => currentTimeSec,
  });
}

async function signed(snapshotHash?: `0x${string}`) {
  const value = claim(snapshotHash);
  return { claim: value, decision, signature: await account.signMessage({
    message: { raw: solverDecisionClaimCommitmentV1(value) },
  }) };
}

describe("general asset decision intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendArtifact.mockReset();
    mocks.resolve.mockReset();
    currentTimeSec = nowSec;
    mocks.verify.mockResolvedValue({ accepted: true, errorCodes: [],
      execution, authorization, verificationValidUntilSec: execution.deadline,
      verificationAnchor: { chainId: 1, blockNumber: "124", blockHash: hash("b") } });
  });

  it("routes committed evidence without requesting a legacy snapshot", async () => {
    await expect(intake().submit(await signed())).resolves.toMatchObject({ state: "accepted" });
    expect(mocks.snapshots).not.toHaveBeenCalled();
    expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({
      blockNumber: inputIdentity.blockNumber, blockHash: inputIdentity.blockHash,
    }));
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({
      proposalKind: "general-asset-program", policy, snapshot: null,
      manifest, valuationEvidence: [valuation],
      identityEvidence: [inputIdentity, outputIdentity],
      anchors: [{ chainId: 1, blockNumber: inputIdentity.blockNumber,
        blockHash: inputIdentity.blockHash }],
    }));
    expect(mocks.appendArtifact.mock.calls.map((call) => call[1])).toEqual([
      "program", "evidence", "provenance", "verdict", "execution", "authorization",
    ]);
  });

  it("rejects evidence drift and missing general asset capability before persistence", async () => {
    await expect(intake().submit(await signed(hash("f")))).rejects.toThrow(/evidence/i);
    await expect(intake([]).submit(await signed())).rejects.toThrow(/general asset/i);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it("never attests an accepted verdict without execution authority", async () => {
    mocks.verify.mockResolvedValueOnce({ accepted: true, errorCodes: [] });
    await expect(intake().submit(await signed())).resolves.toMatchObject({
      state: "rejected", errorCodes: ["EXECUTION_ARTIFACT_MISSING"],
    });
    expect(mocks.resolve.mock.calls.map((call) => call[1])).toEqual(["rejected"]);
    expect(mocks.completeRun).not.toHaveBeenCalled();
  });

  it("rejects authorization commitments that do not match encoded execution", async () => {
    mocks.verify.mockResolvedValueOnce({ accepted: true, errorCodes: [], execution,
      authorization: [{ ...authorization[0]!, executionCommitment: hash("9") }],
      verificationValidUntilSec: execution.deadline,
      verificationAnchor: { chainId: 1, blockNumber: "124", blockHash: hash("b") } });

    await expect(intake().submit(await signed())).resolves.toMatchObject({
      state: "rejected", errorCodes: ["EXECUTION_ARTIFACT_MISSING"],
    });
    expect(mocks.resolve.mock.calls.map((call) => call[1])).not.toContain("attested");
  });

  it("rejects a verification anchor that differs from encoded execution", async () => {
    mocks.verify.mockResolvedValueOnce({ accepted: true, errorCodes: [], execution, authorization,
      verificationValidUntilSec: execution.deadline,
      verificationAnchor: { chainId: 1, blockNumber: "125", blockHash: hash("b") } });

    await expect(intake().submit(await signed())).resolves.toMatchObject({
      state: "rejected", errorCodes: ["EXECUTION_ARTIFACT_MISSING"],
    });
    expect(mocks.resolve.mock.calls.map((call) => call[1])).not.toContain("attested");
  });

  it("never attests when persistence crosses the verified execution deadline", async () => {
    mocks.appendArtifact.mockImplementation(async (_id, kind) => {
      if (kind === "authorization") currentTimeSec = execution.deadline;
    });

    await expect(intake().submit(await signed())).resolves.toMatchObject({
      state: "rejected", errorCodes: ["VERIFICATION_EXPIRED"],
    });
    expect(mocks.resolve.mock.calls.map((call) => call[1])).not.toContain("attested");
    expect(mocks.completeRun).not.toHaveBeenCalled();
  });

  it("fails a verified submission when the final attested transition crosses expiry", async () => {
    mocks.resolve.mockImplementation(async (_id, state) => {
      if (state === "verified") currentTimeSec = execution.deadline;
    });

    await expect(intake().submit(await signed())).resolves.toMatchObject({
      state: "rejected", errorCodes: ["VERIFICATION_EXPIRED"],
    });
    expect(mocks.resolve.mock.calls.map((call) => call[1])).toEqual(["verified", "failed"]);
    expect(mocks.completeRun).not.toHaveBeenCalled();
  });
});
