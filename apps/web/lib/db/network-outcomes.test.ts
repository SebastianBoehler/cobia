import { describe, expect, it } from "vitest";
import { networkAssetIdentityV1, parseNetworkReceiptV1 } from "./network-outcomes";

const transactionHash = `0x${"ab".repeat(32)}`;

describe("network receipt projection", () => {
  it("accepts a confirmed wallet-call batch receipt", () => {
    expect(parseNetworkReceiptV1({
      version: 1,
      kind: "wallet-call-batch-receipt",
      transactionHash,
      receipts: [{ stageId: "swap", transactionHash, blockNumber: "68851188" }],
    })).toEqual({ transactionHash, blockNumber: "68851188" });
  });

  it("keeps the existing single-transaction receipt format", () => {
    expect(parseNetworkReceiptV1({ transactionHash, blockNumber: "123" }))
      .toEqual({ transactionHash, blockNumber: "123" });
  });

  it("uses frozen identity for arbitrary ERC-20 and native assets", () => {
    expect(networkAssetIdentityV1({
      version: 1, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
      capturedAt: "2026-08-25T01:00:00.000Z",
      anchors: [{ chainId: 196, blockNumber: "123", blockHash: `0x${"11".repeat(32)}` }],
      tokenEvidence: [{ chainId: 196, token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        symbol: "OKB", name: "X Layer", decimals: 18, priceUsd: "117",
        provider: "okx-market-v6", assetType: "native", liquidityUsd: "1000000",
        marketDataAt: "2026-08-25T01:00:00.000Z" }],
    }, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"))
      .toEqual({ symbol: "OKB", decimals: 18 });
  });
});
