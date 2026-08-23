import { commitment } from "@cobia/domain";
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
      approvalSpenders: [target],
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
    adapter: { id: "lifi.route", version: 1 },
    target,
    targetRuntimeCodeHash: hash("a"),
    calldata: "0x12345678" as const,
    nativeValueAtomic: "0",
    input: { token: inputToken, maximumAtomic: "100" },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "99" }],
    approvals: [{ token: inputToken, spender: target, maximumAtomic: "100" }],
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
  const compiled = {
    stageId: stage.stageId,
    chainId: 196 as const,
    adapterKey: hash("b"),
    target,
    targetRuntimeCodeHash: hash("a"),
    data: stage.calldata,
    valueAtomic: "0",
    gasLimit: 300_000,
    approvals: stage.approvals,
    refundTokens: stage.refundTokens,
    quoteHash: hash("c"),
    expiresAtSec: 2_000_000_200,
  };
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
    endingAllowances: [{ token: inputToken, spender: target, atomic: "0" }],
    traceHash: hash("e"),
    stateDiffHash: hash("9"),
  };
  return {
    policy,
    program,
    manifest,
    inputValuationEvidence: valuationEvidence,
    verifiedIdentityEvidenceHashes: [hash("4"), hash("6")],
    anchors: [{ chainId: 196, blockNumber: "123", blockHash: hash("d") }],
    nowSec,
    getCodeHash: async () => hash("a"),
    compileStage: async () => compiled,
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
    expect(result.inputExposureUsdE8).toBe("100000000");
  });

  it("rejects unregistered providers, targets, selectors, and code drift", async () => {
    const unregistered = fixture();
    unregistered.manifest.entries = [];
    expect(await errors(unregistered)).toContain("ADAPTER_UNREGISTERED");

    const selector = fixture();
    selector.program.stages[0]!.calldata = "0xdeadbeef";
    selector.program.canonicalProgramHash = canonicalGeneralAssetProgramHash(selector.program);
    expect(await errors(selector)).toContain("SELECTOR_UNREGISTERED");

    const code = fixture();
    code.getCodeHash = async () => hash("f");
    expect(await errors(code)).toContain("TARGET_CODE_DRIFT");
  });

  it("rejects approval or recipient substitutions during adapter compilation", async () => {
    const input = fixture();
    const compile = input.compileStage;
    input.compileStage = async (stage, entry) => ({
      ...(await compile(stage, entry)),
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
    input.inputValuationEvidence = {
      ...(input.inputValuationEvidence as Record<string, unknown>), inputAtomic: "1", conservativeValueUsdE8: "1",
    };
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
    const compile = expired.compileStage;
    expired.compileStage = async (stage, entry) => ({ ...(await compile(stage, entry)), expiresAtSec: nowSec });
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
