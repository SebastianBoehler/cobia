import { AssetIdentityEvidenceV1Schema, AssetValuationEvidenceV1Schema,
  GeneralAssetPolicyV1Schema, commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { publishGeneralAssetIntentV1 } from "./general-asset-publication";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = `0x${"11".repeat(20)}` as const;
const inputToken = `0x${"22".repeat(20)}` as const;
const outputToken = `0x${"33".repeat(20)}` as const;
const target = `0x${"44".repeat(20)}` as const;
const spender = `0x${"55".repeat(20)}` as const;
const inputIdentity = AssetIdentityEvidenceV1Schema.parse({ version: 1, chainId: 196,
  token: inputToken, runtimeCodeHash: hash("1"), proxy: { kind: "none" }, decimals: 18,
  behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("2"),
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300 });
const outputIdentity = AssetIdentityEvidenceV1Schema.parse({ ...inputIdentity,
  token: outputToken, runtimeCodeHash: hash("3") });
const valuation = AssetValuationEvidenceV1Schema.parse({ version: 1,
  assetIdentityHash: commitment(inputIdentity), referenceAsset: { chainId: 196, token: outputToken },
  inputAtomic: "100", conservativeValueUsdE8: "250", maximumDisagreementBps: 0,
  quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
    referenceValueUsdE8: "250", liquidityUsdE8: "100000000", priceImpactBps: 0,
    fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300, quoteHash: hash("4") }],
  capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_300 });
const manifest = { version: 1 as const, entries: [{ providerFamily: "okx" as const,
  adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const, target,
  runtimeCodeHash: hash("5"), selectors: ["0x12345678"],
  approvalSpenders: [{ address: spender, runtimeCodeHash: hash("6") }] }] };
const policy = GeneralAssetPolicyV1Schema.parse({ version: 1, kind: "general-asset",
  requestId: "550e8400-e29b-41d4-a716-446655440088", displayGoal: "Swap", owner,
  sourceChainId: 196, destinationChainId: 196, nonce: hash("7"), createdAt: 2_000_000_000,
  deadline: 2_000_000_600, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: commitment(manifest),
  inputIdentityHash: commitment(inputIdentity), inputValuationHash: commitment(valuation),
  input: { chainId: 196, token: inputToken, maximumAtomic: "100", maximumUsdE8: "250" },
  outputs: [{ chainId: 196, token: outputToken, minimumAtomic: "90",
    identityHash: commitment(outputIdentity) }], allowedAdapters: [{ id: "okx.swap", version: 1 }],
  limits: { maxStages: 1, maxCallsPerStage: 1, maxApprovals: 1, maxCalldataBytes: 1024,
    maxGasPerStage: "1000000", maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1",
    maxSolverFeeUsdE8: "0", maxConversionLossBps: 200, maxSlippageBps: 100 },
  forbiddenTargets: [], forbiddenAssets: [] });

function deps() {
  return { activeManifest: manifest, missingOwnerBalanceChains: vi.fn(async () => []),
    persist: vi.fn(async () => ({ id: policy.requestId })), nowSec: () => 2_000_000_001 };
}

const evidence = { version: 1 as const, kind: "general-asset-evidence" as const,
  identities: [inputIdentity, outputIdentity], valuations: [valuation], manifest };

describe("general asset publication", () => {
  it("persists the exact verified evidence and manifest preimage", async () => {
    const dependencies = deps();
    await expect(publishGeneralAssetIntentV1({ policy, ownerSignature: `0x${"44".repeat(65)}`,
      generalAssetEvidence: evidence }, dependencies))
      .resolves.toEqual({ id: policy.requestId });
    expect(dependencies.persist).toHaveBeenCalledWith(expect.objectContaining({
      generalAssetEvidence: { version: 1, kind: "general-asset-evidence",
        identities: [inputIdentity, outputIdentity], valuations: [valuation], manifest },
    }));
  });

  it("rejects current valuation above the signed USD cap", async () => {
    const dependencies = deps();
    const excessiveValuation = { ...valuation, conservativeValueUsdE8: "251" };
    const cappedPolicy = GeneralAssetPolicyV1Schema.parse({ ...policy,
      inputValuationHash: commitment(excessiveValuation) });
    await expect(publishGeneralAssetIntentV1({ policy: cappedPolicy,
      ownerSignature: `0x${"44".repeat(65)}`, generalAssetEvidence: { ...evidence,
        valuations: [excessiveValuation] } }, dependencies))
      .rejects.toThrow(/input evidence/i);
    expect(dependencies.persist).not.toHaveBeenCalled();
  });
});
