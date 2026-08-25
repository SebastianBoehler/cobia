import { describe, expect, it } from "vitest";
import { parseNetworkReceiptV1 } from "./network-outcomes";

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
});
