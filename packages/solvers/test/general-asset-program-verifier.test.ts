import { AssetValuationEvidenceV1Schema, GeneralAssetPolicyV1Schema, commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import {
  canonicalGeneralAssetProgramHash,
  verifyGeneralAssetProgramV1,
  type GeneralAssetProgramVerificationInputV1,
} from "../src/general-assets/program-verifier";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const hiddenToken = "0x5555555555555555555555555555555555555555" as const;
const spender = "0x6666666666666666666666666666666666666666" as const;
const nowSec = 2_000_000_010;

function fixture(): GeneralAssetProgramVerificationInputV1 {
  const manifest = {
    version: 1 as const,
    entries: [{
      providerFamily: "lifi" as const,
      adapter: { id: "lifi.route", version: 1 },
      chainId: 196 as const,
      target,
      runtimeCodeHash: hash("a"),
      selectors: ["0x12345678" as const],
      approvalSpenders: [{ address: spender, runtimeCodeHash: hash("b") }],
    }],
  };
  const valuationEvidence = {
    version: 1 as const,
    assetIdentityHash: hash("4"),
    referenceAsset: { chainId: 196 as const, token: outputToken },
    inputAtomic: "100",
    conservativeValueUsdE8: "100000000",
    maximumDisagreementBps: 100,
    quotes: [{ adapter: { id: "lifi.quote", version: 1 }, outputAtomic: "99",
      referenceValueUsdE8: "100000000", liquidityUsdE8: "500000000000", priceImpactBps: 20,
      fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_200, quoteHash: hash("8") }],
    capturedAtSec: 2_000_000_000,
    expiresAtSec: 2_000_000_200,
  };
  const policy = {
    version: 1 as const,
    kind: "general-asset" as const,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    displayGoal: "Swap any verified token pair",
    owner,
    sourceChainId: 196 as const,
    destinationChainId: 196 as const,
    nonce: hash("1"),
    createdAt: 2_000_000_000,
    deadline: 2_000_000_300,
    competition: { closesAt: 2_000_000_100, maxRevisionsPerSolver: 5 },
    maxEvidenceAgeSec: 300,
    manifestHash: commitment(manifest),
    inputIdentityHash: hash("4"),
    inputValuationHash: commitment(valuationEvidence),
    input: { chainId: 196 as const, token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000" },
    outputs: [{ chainId: 196 as const, token: outputToken, minimumAtomic: "99", identityHash: hash("6") }],
    allowedAdapters: [{ id: "lifi.route", version: 1 }],
    limits: { maxStages: 2, maxCallsPerStage: 2, maxApprovals: 4, maxCalldataBytes: 1024,
      maxGasPerStage: "1000000", maxNativeValueUsdE8: "1000000", maxBridgeFeeUsdE8: "1000000",
      maxSolverFeeUsdE8: "100000", maxConversionLossBps: 200, maxSlippageBps: 100 },
    forbiddenTargets: [],
    forbiddenAssets: [],
  };
  const stage = {
    stageId: hash("7"),
    index: 0,
    chainId: 196 as const,
    predecessorStageId: null,
    calls: [{ adapter: { id: "lifi.route", version: 1 }, target,
      targetRuntimeCodeHash: hash("a"), calldata: "0x12345678" as const,
      nativeValueAtomic: "0", gasLimit: 300_000,
      approvals: [{ token: inputToken, spender, maximumAtomic: "100" }] }],
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: hash("4"), valuationEvidenceHash: commitment(valuationEvidence) },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "99", identityEvidenceHash: hash("6") }],
    refundTokens: [inputToken, outputToken],
    finality: { confirmations: 12 },
    delivery: { kind: "none" as const },
  };
  const programBase = {
    version: 1 as const,
    kind: "general-asset-program" as const,
    policyHash: commitment(policy),
    manifestHash: commitment(manifest),
    canonicalProgramHash: hash("f"),
    owner,
    deadline: 2_000_000_200,
    identityEvidenceHashes: [hash("4"), hash("6")],
    valuationEvidenceHashes: [commitment(valuationEvidence)],
    stages: [stage],
    finalOutput: { chainId: 196 as const, token: outputToken, minimumAtomic: "99" },
  };
  const program = { ...programBase, canonicalProgramHash: canonicalGeneralAssetProgramHash(programBase) };
  const compiledCall = {
    adapterKey: hash("b"),
    target,
    targetRuntimeCodeHash: hash("a"),
    data: stage.calls[0]!.calldata,
    valueAtomic: "0",
    gasLimit: 300_000,
    approvals: stage.calls[0]!.approvals,
    quoteHash: hash("c"),
    expiresAtSec: 2_000_000_200,
  };
  const compiled = { stageId: stage.stageId, chainId: 196 as const,
    calls: [compiledCall], refundTokens: stage.refundTokens,
    quoteHash: commitment([compiledCall.quoteHash]), expiresAtSec: compiledCall.expiresAtSec };
  const replay = {
    stageId: stage.stageId,
    chainId: 196 as const,
    blockNumber: "123",
    blockHash: hash("d"),
    compiledCallHash: commitment(compiled),
    matchesCompiledCalls: true,
    success: true,
    gasUsed: "200000",
    ownerAssetDeltas: [
      { token: inputToken, deltaAtomic: "-100" },
      { token: outputToken, deltaAtomic: "99" },
    ],
    endingAllowances: [{ token: inputToken, spender, atomic: "0" }],
    traceHash: hash("e"),
    stateDiffHash: hash("9"),
  };
  return {
    policy,
    program,
    manifest,
    valuationEvidence: [valuationEvidence],
    verifiedIdentityEvidenceHashes: [hash("4"), hash("6")],
    anchors: [{ chainId: 196, blockNumber: "123", blockHash: hash("d") }],
    nowSec,
    getCodeHash: async (_chainId, address) => address === target ? hash("a") : hash("b"),
    compileCall: async () => compiledCall,
    replayStage: async () => replay,
  };
}

async function errors(input: GeneralAssetProgramVerificationInputV1) {
  return (await verifyGeneralAssetProgramV1(input)).errorCodes;
}

describe("general asset program verifier", () => {
  it("accepts only exact registered compilation and pinned replay", async () => {
    const result = await verifyGeneralAssetProgramV1(fixture());
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("Expected accepted program");
    expect(result.compiledStages).toHaveLength(1);
    expect(result.replayHash).toBe(commitment(result.replays));
    expect(result.stageInputExposuresUsdE8).toEqual(["100000000"]);
  });

  it("binds verifier-owned fresh evidence while preserving program baseline commitments", async () => {
    const input = fixture();
    const baseline = { ...AssetValuationEvidenceV1Schema.parse(input.valuationEvidence[0]),
      expiresAtSec: nowSec - 1 };
    const baselineHash = commitment(baseline);
    input.valuationEvidence = [baseline];
    input.policy = { ...GeneralAssetPolicyV1Schema.parse(input.policy), inputValuationHash: baselineHash };
    input.program.policyHash = commitment(input.policy);
    input.program.valuationEvidenceHashes = [baselineHash];
    input.program.stages[0]!.input.valuationEvidenceHash = baselineHash;
    input.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(input.program);
    const currentIdentityHash = hash("1");
    const currentValuation = { ...baseline, assetIdentityHash: currentIdentityHash,
      conservativeValueUsdE8: "90000000", capturedAtSec: nowSec, expiresAtSec: nowSec + 30,
      quotes: baseline.quotes.map((quote) => ({ ...quote,
        fetchedAtSec: nowSec, expiresAtSec: nowSec + 30 })) };
    input.currentEvidence = { identities: [
      { programHash: hash("4"), currentHash: currentIdentityHash },
      { programHash: hash("6"), currentHash: hash("2") },
    ], valuations: [{ programHash: input.program.stages[0]!.input.valuationEvidenceHash,
      identityProgramHash: hash("4"), evidence: currentValuation }] };

    const result = await verifyGeneralAssetProgramV1(input);

    expect(result).toMatchObject({ accepted: true, stageObservedInputExposuresUsdE8: ["90000000"],
      stageInputExposuresUsdE8: ["100000000"], stageInputIdentityEvidenceHashes: [currentIdentityHash],
      stageValuationEvidenceHashes: [commitment(currentValuation)] });
  });

  it("rejects fresh exposure above the signed input cap", async () => {
    const input = fixture();
    const baseline = input.valuationEvidence[0] as Record<string, unknown>;
    const currentIdentityHash = hash("1");
    const currentValuation = { ...baseline, assetIdentityHash: currentIdentityHash,
      conservativeValueUsdE8: "100000001", capturedAtSec: nowSec, expiresAtSec: nowSec + 30 };
    input.currentEvidence = { identities: [
      { programHash: hash("4"), currentHash: currentIdentityHash },
      { programHash: hash("6"), currentHash: hash("2") },
    ], valuations: [{ programHash: input.program.stages[0]!.input.valuationEvidenceHash,
      identityProgramHash: hash("4"), evidence: currentValuation }] };

    expect(await errors(input)).toContain("VALUATION_EVIDENCE_MISMATCH");
  });

  it("rejects unregistered providers, targets, selectors, and code drift", async () => {
    const unregistered = fixture();
    unregistered.manifest.entries = [];
    expect(await errors(unregistered)).toContain("ADAPTER_UNREGISTERED");

    const selector = fixture();
    selector.program.stages[0]!.calls[0]!.calldata = "0xdeadbeef";
    selector.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(selector.program);
    expect(await errors(selector)).toContain("SELECTOR_UNREGISTERED");

    const code = fixture();
    code.getCodeHash = async () => hash("f");
    expect(await errors(code)).toContain("TARGET_CODE_DRIFT");
  });

  it("does not turn semantic plugin registration into generic call admission", async () => {
    const input = fixture();
    input.manifest.entries = [];
    const policy = GeneralAssetPolicyV1Schema.parse({ ...GeneralAssetPolicyV1Schema.parse(input.policy),
      manifestHash: commitment(input.manifest),
      allowedAdapters: [{ id: "general.evm-call", version: 1 }] });
    input.policy = policy;
    input.program.manifestHash = policy.manifestHash;
    input.program.policyHash = commitment(policy);
    input.program.stages[0]!.calls[0]!.adapter = { id: "general.evm-call", version: 1 };
    input.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(input.program);
    const result = await verifyGeneralAssetProgramV1(input);

    expect(result.errorCodes).not.toContain("ADAPTER_UNREGISTERED");
    expect(result.errorCodes).not.toContain("SELECTOR_UNREGISTERED");
    expect(result.errorCodes).not.toContain("APPROVAL_SPENDER_UNREGISTERED");
  });

  it("accepts every ordered generic call within the signed contract limits", async () => {
    const input = fixture();
    input.manifest.entries = [];
    const policy = GeneralAssetPolicyV1Schema.parse({ ...GeneralAssetPolicyV1Schema.parse(input.policy),
      manifestHash: commitment(input.manifest),
      allowedAdapters: [{ id: "general.evm-call", version: 1 }] });
    input.policy = policy;
    input.program.manifestHash = policy.manifestHash;
    input.program.policyHash = commitment(policy);
    const first = input.program.stages[0]!.calls[0]!;
    input.program.stages[0]!.calls = [
      { ...first, adapter: { id: "general.evm-call", version: 1 } },
      { ...first, adapter: { id: "general.evm-call", version: 1 }, calldata: "0x87654321" },
    ];
    input.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(input.program);
    const replay = input.replayStage;
    input.replayStage = async (stage, compiled, anchor) => ({
      ...(await replay(stage, compiled, anchor))!, compiledCallHash: commitment(compiled),
    });

    const result = await verifyGeneralAssetProgramV1(input);

    expect(result).toMatchObject({ accepted: true,
      compiledStages: [{ calls: [{ data: "0x12345678" }, { data: "0x87654321" }] }] });
  });

  it("leaves unvalued native call value to a verifier finding", async () => {
    const input = fixture();
    input.manifest.entries = [];
    const policy = GeneralAssetPolicyV1Schema.parse({ ...GeneralAssetPolicyV1Schema.parse(input.policy),
      manifestHash: commitment(input.manifest),
      allowedAdapters: [{ id: "general.evm-call", version: 1 }] });
    input.policy = policy;
    input.program.manifestHash = policy.manifestHash;
    input.program.policyHash = commitment(policy);
    input.program.stages[0]!.calls[0] = { ...input.program.stages[0]!.calls[0]!,
      adapter: { id: "general.evm-call", version: 1 }, nativeValueAtomic: "1" };
    input.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(input.program);

    expect(await errors(input)).toContain("NATIVE_VALUE_EVIDENCE_MISSING");
  });

  it("rejects approval spender runtime code drift at the pinned block", async () => {
    const input = fixture();
    input.getCodeHash = async (_chainId, address) => address === target ? hash("a") : hash("f");
    expect(await errors(input)).toContain("APPROVAL_SPENDER_CODE_DRIFT");
  });

  it("rejects approval or recipient substitutions during adapter compilation", async () => {
    const input = fixture();
    const compile = input.compileCall;
    input.compileCall = async (call, stage, entry) => ({
      ...(await compile(call, stage, entry)),
      approvals: [{ token: inputToken, spender: owner, maximumAtomic: "100" }],
    });
    expect(await errors(input)).toContain("ADAPTER_COMPILE_MISMATCH");
  });

  it("rejects substitution of the exact policy input asset", async () => {
    const input = fixture();
    input.program.stages[0]!.input.token = hiddenToken;
    input.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(input.program);
    expect(await errors(input)).toContain("POLICY_ASSET_MISMATCH");
  });

  it("rejects valuation evidence that does not match the signed USD commitment", async () => {
    const input = fixture();
    input.valuationEvidence = [{
      ...(input.valuationEvidence[0] as Record<string, unknown>), inputAtomic: "1", conservativeValueUsdE8: "1",
    }];
    expect(await errors(input)).toContain("VALUATION_EVIDENCE_MISMATCH");
  });

  it("rejects any identity evidence hash that did not pass asset verification", async () => {
    const input = fixture();
    input.verifiedIdentityEvidenceHashes = [hash("4")];
    expect(await errors(input)).toContain("ASSET_EVIDENCE_MISMATCH");
  });

  it("rejects missing stages, expired quotes, and replay divergence", async () => {
    const missing = fixture();
    missing.replayStage = async () => undefined;
    expect(await errors(missing)).toContain("STAGE_REPLAY_MISSING");

    const expired = fixture();
    const compile = expired.compileCall;
    expired.compileCall = async (call, stage, entry) => ({
      ...(await compile(call, stage, entry)), expiresAtSec: nowSec });
    expect(await errors(expired)).toContain("QUOTE_EXPIRED");

    const diverged = fixture();
    const replay = diverged.replayStage;
    diverged.replayStage = async (stage, compiled, anchor) => ({
      ...(await replay(stage, compiled, anchor))!, matchesCompiledCalls: false,
    });
    expect(await errors(diverged)).toContain("REPLAY_DIVERGED");
  });

  it("rejects output gaps and favorable outputs with hidden owner loss", async () => {
    const gap = fixture();
    const replayGap = gap.replayStage;
    gap.replayStage = async (stage, compiled, anchor) => ({
      ...(await replayGap(stage, compiled, anchor))!,
      ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" }],
    });
    expect(await errors(gap)).toContain("OUTPUT_NOT_REPRODUCED");

    const hidden = fixture();
    const replayHidden = hidden.replayStage;
    hidden.replayStage = async (stage, compiled, anchor) => ({
      ...(await replayHidden(stage, compiled, anchor))!,
      ownerAssetDeltas: [
        { token: inputToken, deltaAtomic: "-100" },
        { token: outputToken, deltaAtomic: "120" },
        { token: hiddenToken, deltaAtomic: "-1" },
      ],
    });
    expect(await errors(hidden)).toContain("UNDECLARED_ASSET_DECREASE");
  });
});
