import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema,
  GeneralAssetProgramV1Schema,
  commitment,
} from "@cobia/domain";
import { buildGeneralAssetDecisionV1 } from "@cobia/solvers";
import { encodeFunctionData, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { COBIA_EXECUTOR_V4_ABI } from "../execution-v4/abi";
import { authorizationTypedDataV4, generalAssetStageNonceV4 } from
  "../execution-v4/attestation";
import { buildAuthorizationV4, type ExecutionProgramV4 } from "../execution-v4/commitment";
import { publishAndRunGeneralAssetSolverV1 } from "./run-general-asset-solver";
import type { GeneralAssetSolutionVerdictV1 } from "./validate-general-asset-solution";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;
const owner = address("1");
const executor = address("2");
const inputToken = address("3");
const outputToken = address("4");
const target = address("5");
const spender = address("6");
const verifier = privateKeyToAccount(`0x${"77".repeat(32)}`);
const otherVerifier = privateKeyToAccount(`0x${"88".repeat(32)}`);
const inputIdentity = AssetIdentityEvidenceV1Schema.parse({
  version: 1, chainId: 196, token: inputToken, runtimeCodeHash: hash("1"),
  proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("2"),
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({
  ...inputIdentity, token: outputToken, runtimeCodeHash: hash("3"),
});
const valuation = AssetValuationEvidenceV1Schema.parse({
  version: 1, assetIdentityHash: commitment(inputIdentity),
  referenceAsset: { chainId: 196, token: outputToken }, inputAtomic: "100",
  conservativeValueUsdE8: "250", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
    referenceValueUsdE8: "250", liquidityUsdE8: "100000000", priceImpactBps: 0,
    fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300, quoteHash: hash("4") }],
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300,
});
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const, target,
  runtimeCodeHash: hash("5"), selectors: ["0x12345678"],
  approvalSpenders: [{ address: spender, runtimeCodeHash: hash("6") }] }] };
const evidence = { version: 1 as const, kind: "general-asset-evidence" as const,
  identities: [inputIdentity, outputIdentity], valuations: [valuation], manifest };
const policy = GeneralAssetPolicyV1Schema.parse({
  version: 1, kind: "general-asset", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Swap", owner, sourceChainId: 196, destinationChainId: 196,
  nonce: hash("7"), createdAt: 2_000_000_000, deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  manifestHash: commitment(manifest), inputIdentityHash: commitment(inputIdentity),
  inputValuationHash: commitment(valuation),
  input: { chainId: 196, token: inputToken, maximumAtomic: "100", maximumUsdE8: "250" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }], allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [],
});

async function verifiedArtifacts(value: unknown, replayOverrides: {
  outputAtomic?: string;
  endingAllowanceAtomic?: string;
  extraDecrease?: boolean;
  unexpectedSigner?: boolean;
  freshValueUsdE8?: string;
} = {}) {
  const program = GeneralAssetProgramV1Schema.parse(value);
  const stage = program.stages[0]!;
  const freshInput = AssetIdentityEvidenceV1Schema.parse({ ...inputIdentity,
    blockNumber: "124", blockHash: hash("b"), expiresAtSec: 2_000_000_031 });
  const freshOutput = AssetIdentityEvidenceV1Schema.parse({ ...outputIdentity,
    blockNumber: "124", blockHash: hash("b"), expiresAtSec: 2_000_000_031 });
  const freshValuation = AssetValuationEvidenceV1Schema.parse({ ...valuation,
    assetIdentityHash: commitment(freshInput),
    conservativeValueUsdE8: replayOverrides.freshValueUsdE8 ?? "200",
    expiresAtSec: 2_000_000_031,
    quotes: valuation.quotes.map((quote) => ({ ...quote, expiresAtSec: 2_000_000_031 })) });
  const freshEvidenceBody = { identities: [freshInput, freshOutput],
    valuations: [freshValuation],
    anchors: [{ chainId: 196 as const, blockNumber: "124", blockHash: hash("b") }] };
  const replay = [{ stageId: stage.stageId, chainId: 196 as const, blockNumber: "124",
    blockHash: hash("b"), compiledCallHash: hash("c"), matchesCompiledCalls: true,
    success: true, gasUsed: "200000",
    ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" },
      { token: outputToken, deltaAtomic: replayOverrides.outputAtomic ?? "90" },
      ...(replayOverrides.extraDecrease
        ? [{ token: target, deltaAtomic: "-1" }]
        : [])],
    endingAllowances: [{ token: inputToken, spender,
      atomic: replayOverrides.endingAllowanceAtomic ?? "0" }],
    traceHash: hash("d"), stateDiffHash: hash("e") }];
  const executionProgram: ExecutionProgramV4 = {
    policyHash: program.policyHash, manifestHash: program.manifestHash,
    canonicalProgramHash: program.canonicalProgramHash,
    inputIdentityEvidenceHash: commitment(freshInput),
    outputIdentityEvidenceHash: commitment(freshOutput),
    valuationEvidenceHash: commitment(freshValuation),
    stageHash: commitment(stage), simulationHash: commitment(replay[0]!),
    pinnedBlockNumber: 124n, pinnedBlockHash: hash("b"), sourceChainId: 196n,
    owner, inputToken, outputToken, inputAmount: 100n, inputUsdE8: 250n,
    deadline: 2_000_000_031n, nonce: generalAssetStageNonceV4(policy.nonce, stage),
    refundTokens: [inputToken, outputToken], calls: [{
      adapterKey: keccak256(stringToHex("okx.swap@1")), target,
      value: 0n, gasLimit: 300_000,
      approvals: [{ token: inputToken, spender, amount: 100n }], data: "0x12345678" }],
    constraints: [{ token: outputToken, kind: 1, minimum: 90n }],
  };
  const verifierAuthorization = buildAuthorizationV4(executionProgram, executor);
  const signer = replayOverrides.unexpectedSigner ? otherVerifier : verifier;
  const signature = await signer.signTypedData(authorizationTypedDataV4(verifierAuthorization));
  const evidenceHash = hash("a");
  return { accepted: true as const, errorCodes: [], replay,
    execution: { version: 4 as const, kind: "general-asset-execution" as const,
      programId: program.canonicalProgramHash, owner, deadline: 2_000_000_031,
      finalOutput: program.finalOutput, stages: [{ stageId: stage.stageId, ordinal: 0,
        chainId: 196 as const, predecessorStageId: null, inputToken, requiredConfirmations: 12,
        transaction: { chainId: 196 as const, from: owner, to: executor, value: "0x0" as const,
          data: encodeFunctionData({ abi: COBIA_EXECUTOR_V4_ABI, functionName: "execute",
            args: [executionProgram, verifierAuthorization, signature] }) },
        expectedLogs: [], delivery: { kind: "none" as const }, evidenceHash }] },
    authorization: [{ version: 4 as const, stageIndex: 0, chainId: 196 as const, executor,
      executionCommitment: verifierAuthorization.executionCommitment, evidenceHash, signature }],
    verificationValidUntilSec: 2_000_000_031,
    verificationAnchor: { chainId: 196 as const, blockNumber: "124", blockHash: hash("b") },
    freshEvidence: { ...freshEvidenceBody, hash: commitment(freshEvidenceBody) } };
}

function dependencies() {
  const artifacts: Array<[string, unknown]> = [];
  return {
    artifacts,
    assertReady: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ id: policy.requestId })),
    profiles: { register: vi.fn(async () => undefined) },
    runs: { create: vi.fn(async () => ({ id: "run-v4" })), start: vi.fn(), complete: vi.fn(),
      fail: vi.fn() },
    submissions: { append: vi.fn(async () => ({ id: "submission-v4" })),
      appendArtifact: vi.fn(async (_id: string, kind: string, value: unknown) => {
        artifacts.push([kind, value]);
      }), resolve: vi.fn() },
    build: () => buildGeneralAssetDecisionV1({ policy, evidence, executor,
      nowSec: 2_000_000_001, compile: async () => ({ target, data: "0x12345678", valueAtomic: "0",
        gasLimit: 300_000, approval: { spender, maximumAtomic: "100", data: "0x095ea7b3" },
        quoteHash: hash("8"), fetchedAtSec: 2_000_000_001, expiresAtSec: 2_000_000_031 }) }),
    verify: vi.fn(async ({ program }: { program: unknown }): Promise<GeneralAssetSolutionVerdictV1> =>
      verifiedArtifacts(program)),
    executor,
    verifierSigner: verifier.address,
    nowSec: () => 2_000_000_001,
  };
}

describe("production general asset solver orchestration", () => {
  it("persists an attested decision when fresh value is below the signed risk cap", async () => {
    const deps = dependencies();
    const result = await publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1, nowSec: 2_000_000_001 }, deps);

    expect(result).toMatchObject({ intent: { id: policy.requestId },
      solution: { state: "attested", submissionId: "submission-v4" } });
    expect(deps.assertReady).toHaveBeenCalledBefore(deps.publish);
    expect(deps.verify).toHaveBeenCalledBefore(deps.publish);
    expect(deps.profiles.register).toHaveBeenCalledWith(expect.objectContaining({
      id: "cobia-coding-agent", operatorKind: "internal",
      declaredCapabilities: expect.arrayContaining(["general-asset@1"]),
    }));
    expect(deps.artifacts.map(([kind]) => kind)).toEqual([
      "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
    ]);
  });

  it("does not publish when strict verification rejects the solution", async () => {
    const deps = dependencies();
    deps.verify.mockResolvedValue({ accepted: false, errorCodes: ["REPLAY_DIVERGED"] });

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/REPLAY_DIVERGED/);

    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.profiles.register).not.toHaveBeenCalled();
    expect(deps.runs.create).not.toHaveBeenCalled();
    expect(deps.submissions.append).not.toHaveBeenCalled();
  });

  it("does not publish an execution artifact for a different executor", async () => {
    const deps = dependencies();
    deps.verify.mockImplementation(async ({ program }: { program: unknown }) => {
      const result = await verifiedArtifacts(program);
      return { ...result, authorization: [{ ...result.authorization[0]!, executor: target }] };
    });

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/artifact|authorization|executor/i);

    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.submissions.append).not.toHaveBeenCalled();
  });

  it("does not publish when the encoded execution uses a different fresh anchor", async () => {
    const deps = dependencies();
    deps.verify.mockImplementation(async ({ program }: { program: unknown }) => {
      const result = await verifiedArtifacts(program);
      return { ...result, verificationAnchor: { ...result.verificationAnchor,
        blockHash: hash("f") } };
    });

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/authorization|anchor|commitment/i);

    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.submissions.append).not.toHaveBeenCalled();
  });

  it("does not publish an artifact signed by another verifier", async () => {
    const deps = dependencies();
    deps.verify.mockImplementation(async ({ program }: { program: unknown }) =>
      verifiedArtifacts(program, { unexpectedSigner: true }));

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/signature|signer/i);

    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("does not publish when fresh conservative value exceeds the signed cap", async () => {
    const deps = dependencies();
    deps.verify.mockImplementation(async ({ program }: { program: unknown }) =>
      verifiedArtifacts(program, { freshValueUsdE8: "251" }));

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/fresh evidence|authority|cap/i);

    expect(deps.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["output minimum", { outputAtomic: "89" }],
    ["allowance cleanup", { endingAllowanceAtomic: "1" }],
    ["undeclared decrease", { extraDecrease: true }],
  ])("does not publish replay evidence that violates %s", async (_name, replayOverrides) => {
    const deps = dependencies();
    deps.verify.mockImplementation(async ({ program }: { program: unknown }) =>
      verifiedArtifacts(program, replayOverrides));

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/replay|flow|allowance|output|asset/i);

    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("does not publish or advertise the lane while V4 is not public-ready", async () => {
    const deps = dependencies();
    deps.assertReady.mockRejectedValue(new Error("General asset V4 is not public-ready"));
    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow("not public-ready");
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.profiles.register).not.toHaveBeenCalled();
  });

  it("does not publish when verifier-owned time crosses the authorization deadline", async () => {
    const deps = dependencies();
    deps.nowSec = vi.fn().mockReturnValue(2_000_000_031);

    await expect(publishAndRunGeneralAssetSolverV1({ policy,
      ownerSignature: `0x${"aa".repeat(65)}`, evidence, revision: 1,
      nowSec: 2_000_000_001 }, deps)).rejects.toThrow(/expired/i);

    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.submissions.append).not.toHaveBeenCalled();
  });
});
