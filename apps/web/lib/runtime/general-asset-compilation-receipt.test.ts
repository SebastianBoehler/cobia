import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { parseGeneralAssetCompilationReceiptV1 } from "./general-asset-compilation-receipt";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const leaseId = "550e8400-e29b-41d4-a716-446655440077";
const evidence = { version: 1 as const, kind: "general-asset-evidence" as const,
  identities: [{ version: 1 as const, chainId: 196 as const,
    token: "0x2222222222222222222222222222222222222222" as const,
    runtimeCodeHash: hash("1"), proxy: { kind: "none" as const }, decimals: 18,
    behaviorModule: { id: "plain-erc20", version: 1 }, blockNumber: "123", blockHash: hash("2"),
    capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030 }],
  valuations: [{ version: 1 as const, assetIdentityHash: hash("5"),
    referenceAsset: { chainId: 196 as const, token: "0x5555555555555555555555555555555555555555" as const },
    inputAtomic: "100", conservativeValueUsdE8: "100", maximumDisagreementBps: 0,
    quotes: [{ adapter: { id: "okx.swap", version: 1 }, outputAtomic: "90",
      referenceValueUsdE8: "100", liquidityUsdE8: "1000000", priceImpactBps: 0,
      fetchedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030, quoteHash: hash("6") }],
    capturedAtSec: 2_000_000_000, expiresAtSec: 2_000_000_030 }],
  manifest: { version: 1 as const, entries: [{ providerFamily: "okx" as const,
    adapter: { id: "okx.swap", version: 1 }, chainId: 196 as const,
    target: "0x3333333333333333333333333333333333333333" as const,
    runtimeCodeHash: hash("3"), selectors: ["0x12345678" as const], approvalSpenders: [{
      address: "0x4444444444444444444444444444444444444444" as const, runtimeCodeHash: hash("4") }],
  }] } };
const receipt = { status: "review" as const, compilationLeaseId: leaseId,
  evidenceExpiresAtSec: 2_000_000_030, generalAssetEvidence: evidence,
  values: { kind: "general-asset-draft" as const, evidenceExpiresAtSec: 2_000_000_030 } };

describe("general asset compilation receipt", () => {
  it("returns the exact server evidence preimage for its lease", () => {
    expect(parseGeneralAssetCompilationReceiptV1(receipt, leaseId)).toMatchObject({
      evidenceHash: commitment(evidence), evidence,
    });
  });

  it("rejects receipt substitution and expiry tampering with refresh-required semantics", () => {
    expect(() => parseGeneralAssetCompilationReceiptV1(receipt,
      "550e8400-e29b-41d4-a716-446655440078")).toThrow("refresh before signing");
    expect(() => parseGeneralAssetCompilationReceiptV1({ ...receipt,
      evidenceExpiresAtSec: 2_000_000_029 }, leaseId)).toThrow("refresh before signing");
  });
});
