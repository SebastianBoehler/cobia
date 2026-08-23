import { GeneralAssetPolicyV1Schema } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { publishGeneralAssetIntentV1 } from "./general-asset-publication";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = GeneralAssetPolicyV1Schema.parse({ version: 1, kind: "general-asset",
  requestId: "550e8400-e29b-41d4-a716-446655440088", displayGoal: "Swap", owner: `0x${"11".repeat(20)}`,
  sourceChainId: 1, destinationChainId: 196, nonce: hash("1"), createdAt: 2_000_000_000,
  deadline: 2_000_000_600, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: hash("2"), inputIdentityHash: hash("3"),
  inputValuationHash: hash("4"), input: { chainId: 1, token: `0x${"22".repeat(20)}`,
    maximumAtomic: "100", maximumUsdE8: "250" }, outputs: [{ chainId: 196,
    token: `0x${"33".repeat(20)}`, minimumAtomic: "1", identityHash: hash("5") }],
  allowedAdapters: [{ id: "lifi.route", version: 1 }], limits: { maxStages: 2,
    maxCallsPerStage: 2, maxApprovals: 4, maxCalldataBytes: 1024, maxGasPerStage: "1000000",
    maxNativeValueUsdE8: "1", maxBridgeFeeUsdE8: "1", maxSolverFeeUsdE8: "0",
    maxConversionLossBps: 200, maxSlippageBps: 100 }, forbiddenTargets: [], forbiddenAssets: [] });

function deps(valueUsdE8 = "250") {
  return { activeManifestHash: policy.manifestHash, missingOwnerBalanceChains: vi.fn(async () => []),
    verifier: { eligibility: vi.fn(async ({ inputAtomic }: { inputAtomic?: string }) => inputAtomic
      ? { status: "eligible" as const, identityHash: policy.inputIdentityHash,
        valuationHash: policy.inputValuationHash, valuationEvidence: { conservativeValueUsdE8: valueUsdE8 } }
      : { status: "eligible" as const, identityHash: policy.outputs[0]!.identityHash }) },
    persist: vi.fn(async () => ({ id: policy.requestId })) };
}

describe("general asset publication", () => {
  it("revalidates exact input/output commitments before persistence", async () => {
    const dependencies = deps();
    await expect(publishGeneralAssetIntentV1({ policy, ownerSignature: `0x${"44".repeat(65)}` }, dependencies))
      .resolves.toEqual({ id: policy.requestId });
    expect(dependencies.verifier.eligibility).toHaveBeenCalledTimes(2);
  });

  it("rejects current valuation above the signed USD cap", async () => {
    const dependencies = deps("251");
    await expect(publishGeneralAssetIntentV1({ policy, ownerSignature: `0x${"44".repeat(65)}` }, dependencies))
      .rejects.toThrow(/input evidence/i);
    expect(dependencies.persist).not.toHaveBeenCalled();
  });
});
