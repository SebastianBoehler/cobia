import { describe, expect, it } from "vitest";
import {
  networkAssetIdentityV1,
  parseNetworkReceiptV1,
  transactionNetworkPrincipalV1,
} from "./network-outcomes";

const transactionHash = `0x${"ab".repeat(32)}`;

describe("network receipt projection", () => {
  it("projects external inputs and terminal outputs across a multi-step wallet route", () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const okb = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const intermediate = "0x5555555555555555555555555555555555555555";
    const secondOutput = "0x6666666666666666666666666666666666666666";
    const stage = ({ id, inputToken, inputAtomic, outputToken, minimumAtomic, dependsOn = [],
      tools = ["okx-dex-api"] }: {
      id: string; inputToken: string; inputAtomic: string; outputToken: string;
      minimumAtomic: string; dependsOn?: string[]; tools?: string[];
    }) => ({
      id,
      chainId: 196 as const,
      dependsOn,
      kind: "wallet-transaction" as const,
      provider: "okx.dex@1",
      quoteHash: `0x${"11".repeat(32)}`,
      responseHash: `0x${"22".repeat(32)}`,
      fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
      sender: owner,
      recipient: owner,
      input: { token: inputToken, atomic: inputAtomic },
      output: { chainId: 196 as const, token: outputToken, minimumAtomic },
      transaction: {
        target: "0x2222222222222222222222222222222222222222",
        selector: "0x12345678",
        dataHash: `0x${"33".repeat(32)}`,
        valueAtomic: "0",
      },
      tools,
    });

    expect(transactionNetworkPrincipalV1({
      version: 1,
      programId: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      policyHash: `0x${"44".repeat(32)}`,
      owner,
      createdAt: 2_000_000_000,
      deadline: 2_000_000_300,
      maxEvidenceAgeSec: 300,
      stages: [
        stage({ id: "route-01", inputToken: "0x3333333333333333333333333333333333333333",
          inputAtomic: "5618001", outputToken: intermediate, minimumAtomic: "48725488409087906" }),
        stage({ id: "route-02", inputToken: "0x4444444444444444444444444444444444444444",
          inputAtomic: "9983", outputToken: okb, minimumAtomic: "86745567600372" }),
        stage({ id: "route-03", inputToken: intermediate, inputAtomic: "48725488409087906",
          outputToken: secondOutput, minimumAtomic: "48000000", dependsOn: ["route-01"],
          tools: ["uniswap-v3.exact-input"] }),
      ],
    })).toEqual({
      chainId: 196,
      principals: [
        { token: "0x3333333333333333333333333333333333333333", atomic: "5618001" },
        { token: "0x4444444444444444444444444444444444444444", atomic: "9983" },
      ],
      intentClass: "multi-asset-swap",
      resultLabel: "Multi-asset swap",
      route: {
        protocols: ["OKX DEX", "Uniswap V3"],
        minimumOutputs: [
          { token: okb, atomic: "86745567600372" },
          { token: secondOutput, atomic: "48000000" },
        ],
      },
    });
  });

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
