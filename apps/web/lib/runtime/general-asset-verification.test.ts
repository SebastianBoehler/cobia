import { AssetIdentityEvidenceV1Schema, commitment } from "@cobia/domain";
import { canonicalGeneralAssetProgramHash } from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { verifyRawGeneralAssetIdentityV1,
  verifyRuntimeGeneralAssetProposalV1 } from "./general-asset-verification";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const target = "0x3333333333333333333333333333333333333333" as const;
const outputToken = "0x4444444444444444444444444444444444444444" as const;
const executor = "0x5555555555555555555555555555555555555555" as const;
const spender = "0x6666666666666666666666666666666666666666" as const;
const nowSec = 2_000_000_010;

function fixture() {
  const identity = (token: typeof inputToken | typeof outputToken, byte: string) =>
    AssetIdentityEvidenceV1Schema.parse({ version: 1, chainId: 196, token,
      runtimeCodeHash: hash(byte), proxy: { kind: "none" }, decimals: 18,
      behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("d"),
      capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_100 });
  const identities = [identity(inputToken, "4"), identity(outputToken, "6")];
  const valuation = { version: 1 as const, assetIdentityHash: commitment(identities[0]!),
    referenceAsset: { chainId: 196 as const, token: outputToken }, inputAtomic: "100",
    conservativeValueUsdE8: "100000000", maximumDisagreementBps: 100,
    quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "99",
      referenceValueUsdE8: "100000000", liquidityUsdE8: "500000000000", priceImpactBps: 20,
      fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_100, quoteHash: hash("8") }],
    capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_100 };
  const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
    adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const, target,
    runtimeCodeHash: hash("a"), selectors: ["0x12345678" as const],
    approvalSpenders: [{ address: spender, runtimeCodeHash: hash("b") }] }] };
  const policy = { version: 1 as const, kind: "general-asset" as const,
    requestId: "550e8400-e29b-41d4-a716-446655440000", displayGoal: "Swap", owner,
    sourceChainId: 196 as const, destinationChainId: 196 as const, nonce: hash("1"),
    createdAt: 2_000_000_000, deadline: 2_000_000_100,
    competition: { closesAt: 2_000_000_090, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
    manifestHash: commitment(manifest), inputIdentityHash: commitment(identities[0]!),
    inputValuationHash: commitment(valuation), input: { chainId: 196 as const, token: inputToken,
      maximumAtomic: "100", maximumUsdE8: "100000000" }, outputs: [{ chainId: 196 as const,
      token: outputToken, minimumAtomic: "99", identityHash: commitment(identities[1]!) }],
    allowedAdapters: [{ id: "okx.swap", version: 1 }], limits: { maxStages: 1,
      maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024, maxGasPerStage: "1000000",
      maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1", maxSolverFeeUsdE8: "0",
      maxConversionLossBps: 200, maxSlippageBps: 100 }, forbiddenTargets: [], forbiddenAssets: [] };
  const stage = { stageId: hash("7"), index: 0, chainId: 196 as const,
    predecessorStageId: null, adapter: { id: "okx.swap", version: 1 }, target,
    targetRuntimeCodeHash: hash("a"), calldata: "0x12345678" as const, nativeValueAtomic: "0",
    input: { token: inputToken, maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: policy.inputIdentityHash, valuationEvidenceHash: policy.inputValuationHash },
    outputs: [{ token: outputToken, minimumIncreaseAtomic: "99",
      identityEvidenceHash: policy.outputs[0]!.identityHash }],
    approvals: [{ token: inputToken, spender, maximumAtomic: "100" }],
    refundTokens: [inputToken, outputToken], finality: { confirmations: 12 },
    delivery: { kind: "none" as const } };
  const base = { version: 1 as const, kind: "general-asset-program" as const,
    policyHash: commitment(policy), manifestHash: commitment(manifest), canonicalProgramHash: hash("f"),
    owner, deadline: 2_000_000_080, identityEvidenceHashes: identities.map(commitment).sort(),
    valuationEvidenceHashes: [commitment(valuation)], stages: [stage],
    finalOutput: { chainId: 196 as const, token: outputToken, minimumAtomic: "99" } };
  const program = { ...base, canonicalProgramHash: canonicalGeneralAssetProgramHash(base) };
  const compileSwap = vi.fn(async () => ({ target, data: stage.calldata, valueAtomic: "0" as const,
    gasLimit: 300_000, approval: { spender, maximumAtomic: "100", data: "0x095ea7b3" as const },
    quoteHash: hash("c"), fetchedAtSec: nowSec, expiresAtSec: nowSec + 30,
    source: { approveRequest: "/approve", approval: {}, swapRequest: "/swap", swap: {} } }));
  const refreshAsset = vi.fn(async ({ token, inputAtomic }: { token: Address; inputAtomic?: string }) => {
    const baseline = identities.find((value) => value.token === token)!;
    const identityEvidence = { ...baseline, blockNumber: "124", blockHash: hash("e"),
      capturedAtSec: nowSec, expiresAtSec: nowSec + 30 };
    if (!inputAtomic) return { status: "eligible" as const,
      identityHash: commitment(identityEvidence), identityEvidence };
    const valuationEvidence = { ...valuation, assetIdentityHash: commitment(identityEvidence),
      capturedAtSec: nowSec, expiresAtSec: nowSec + 30,
      quotes: valuation.quotes.map((quote) => ({ ...quote, fetchedAtSec: nowSec,
        expiresAtSec: nowSec + 30 })) };
    return { status: "eligible" as const, identityHash: commitment(identityEvidence), identityEvidence,
      valuationHash: commitment(valuationEvidence), valuationEvidence };
  });
  return { input: { policy, program, manifest, identityEvidence: identities,
    valuationEvidence: [valuation], anchors: [{ chainId: 196 as const, blockNumber: "123",
      blockHash: hash("d") }], nowSec }, stage, compileSwap, refreshAsset };
}

describe("production general asset proposal verification", () => {
  it("compiles, replays, attests, and bundles one exact same-chain OKX stage", async () => {
    const value = fixture();
    const account = privateKeyToAccount(`0x${"77".repeat(32)}`);
    const assertReady = vi.fn(async () => undefined);
    const result = await verifyRuntimeGeneralAssetProposalV1(value.input, {
      executor, executorCodeHash: hash("e"), refreshAsset: value.refreshAsset,
      nowSec: () => nowSec,
      getCodeHash: async (_chainId, address) => address === executor ? hash("e")
        : address === target ? hash("a") : hash("b"), compileSwap: value.compileSwap,
      replayStage: async (_stage, compiled, anchor) => ({ stageId: value.stage.stageId,
        chainId: 196, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
        compiledCallHash: commitment(compiled), matchesCompiledCalls: true, success: true,
        gasUsed: "200000", ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" },
          { token: outputToken, deltaAtomic: "99" }],
        endingAllowances: [{ token: inputToken, spender, atomic: "0" }],
        traceHash: hash("9"), stateDiffHash: hash("8") }),
      signTypedData: (typedData) => account.signTypedData(typedData),
      assertReady,
    });

    expect(result).toMatchObject({ accepted: true,
      execution: { kind: "general-asset-execution", stages: [{ chainId: 196 }] },
      authorization: [{ stageIndex: 0 }] });
    expect(value.compileSwap).toHaveBeenCalledWith(expect.objectContaining({ executor, owner,
      inputToken, outputToken, inputAtomic: "100", minimumOutputAtomic: "99" }));
    expect(assertReady).toHaveBeenCalledOnce();
    expect(result.accepted && result.freshEvidence.identities[0]).toMatchObject({ blockNumber: "124" });
  });

  it("independently rereads every baseline identity field at its pinned block", async () => {
    const evidence = fixture().input.identityEvidence[0]!;
    const reader = { latestBlockNumber: vi.fn(),
      blockHash: vi.fn(async () => evidence.blockHash),
      runtimeCodeHash: vi.fn(async () => evidence.runtimeCodeHash),
      proxy: vi.fn(async () => evidence.proxy), decimals: vi.fn(async () => evidence.decimals) };

    await expect(verifyRawGeneralAssetIdentityV1(evidence, reader, nowSec)).resolves.toBe(true);
    reader.decimals.mockResolvedValueOnce(evidence.decimals + 1);
    await expect(verifyRawGeneralAssetIdentityV1(evidence, reader, nowSec)).resolves.toBe(false);
  });

  it("rejects semantic identity drift before compilation", async () => {
    const value = fixture();
    const refreshAsset = async (request: { token: Address; inputAtomic?: string }) => {
      const result = await value.refreshAsset(request);
      if (request.token !== inputToken || !result.identityEvidence) return result;
      const identityEvidence = { ...result.identityEvidence, decimals: 6 };
      return { ...result, identityHash: commitment(identityEvidence), identityEvidence };
    };

    const result = await verifyRuntimeGeneralAssetProposalV1(value.input, {
      executor, executorCodeHash: hash("e"), refreshAsset,
      nowSec: () => nowSec,
      getCodeHash: vi.fn(), compileSwap: value.compileSwap,
      replayStage: vi.fn(), signTypedData: vi.fn(),
    });

    expect(result).toEqual({ accepted: false, errorCodes: ["ASSET_EVIDENCE_MISMATCH"] });
    expect(value.compileSwap).not.toHaveBeenCalled();
  });

  it("fails closed before compilation for bridge or multi-stage programs", async () => {
    const value = fixture();
    const input = { ...value.input, program: { ...value.input.program,
      stages: [value.stage, { ...value.stage, index: 1,
        predecessorStageId: value.stage.stageId }] } } as never;
    const result = await verifyRuntimeGeneralAssetProposalV1(input, {
      executor, executorCodeHash: hash("e"), refreshAsset: value.refreshAsset,
      nowSec: () => nowSec,
      getCodeHash: async () => hash("e"), compileSwap: value.compileSwap,
      replayStage: vi.fn(), signTypedData: vi.fn(),
    });
    expect(result).toEqual({ accepted: false, errorCodes: ["ROUTE_UNSUPPORTED"] });
    expect(value.compileSwap).not.toHaveBeenCalled();
  });

  it("rejects opaque calldata whose pinned replay decreases an undeclared owner asset", async () => {
    const value = fixture();
    const hidden = "0x8888888888888888888888888888888888888888" as const;
    const result = await verifyRuntimeGeneralAssetProposalV1(value.input, {
      executor, executorCodeHash: hash("e"), refreshAsset: value.refreshAsset,
      nowSec: () => nowSec,
      getCodeHash: async (_chainId, address) => address === executor ? hash("e")
        : address === target ? hash("a") : hash("b"), compileSwap: value.compileSwap,
      replayStage: async (_stage, compiled, anchor) => ({ stageId: value.stage.stageId,
        chainId: 196, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
        compiledCallHash: commitment(compiled), matchesCompiledCalls: true, success: true,
        gasUsed: "200000", ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" },
          { token: outputToken, deltaAtomic: "99" }, { token: hidden, deltaAtomic: "-1" }],
        endingAllowances: [{ token: inputToken, spender, atomic: "0" }],
        traceHash: hash("9"), stateDiffHash: hash("8") }), signTypedData: vi.fn(),
    });
    expect(result).toMatchObject({ accepted: false,
      errorCodes: expect.arrayContaining(["UNDECLARED_ASSET_DECREASE"]) });
  });

  it("does not return an attestation when signing crosses fresh evidence expiry", async () => {
    const value = fixture();
    const account = privateKeyToAccount(`0x${"77".repeat(32)}`);
    const clock = vi.fn()
      .mockReturnValueOnce(nowSec)
      .mockReturnValueOnce(nowSec + 1)
      .mockReturnValue(nowSec + 31);
    const signTypedData = vi.fn((typedData) => account.signTypedData(typedData));
    const result = await verifyRuntimeGeneralAssetProposalV1(value.input, {
      executor, executorCodeHash: hash("e"), refreshAsset: value.refreshAsset, nowSec: clock,
      getCodeHash: async (_chainId, address) => address === executor ? hash("e")
        : address === target ? hash("a") : hash("b"), compileSwap: value.compileSwap,
      replayStage: async (_stage, compiled, anchor) => ({ stageId: value.stage.stageId,
        chainId: 196, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
        compiledCallHash: commitment(compiled), matchesCompiledCalls: true, success: true,
        gasUsed: "200000", ownerAssetDeltas: [{ token: inputToken, deltaAtomic: "-100" },
          { token: outputToken, deltaAtomic: "99" }],
        endingAllowances: [{ token: inputToken, spender, atomic: "0" }],
        traceHash: hash("9"), stateDiffHash: hash("8") }), signTypedData,
    });

    expect(signTypedData).toHaveBeenCalledOnce();
    expect(result).toEqual({ accepted: false, errorCodes: ["VERIFICATION_EXPIRED"] });
  });
});
