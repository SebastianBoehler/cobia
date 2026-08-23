import { describe, expect, it } from "vitest";
import { reconcileReceiptV4, type ReceiptReconciliationInputV4 } from "./receipt-reconciler";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const;
const target = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
const token = "0x74d2f3c2f0bde8da40040dd9d6f52176d0cb2418" as const;
const calldata = "0x12345678" as const;

function input(): ReceiptReconciliationInputV4 {
  return {
    expected: {
      chainId: 196,
      transactionHash: hash("1"),
      sender: owner,
      nonce: "7",
      target,
      valueAtomic: "0",
      calldata,
      logs: [{ address: target, topics: [hash("2")], data: "0x" }],
    },
    observed: {
      chainId: 196,
      transactionHash: hash("1"),
      sender: owner,
      nonce: "7",
      target,
      valueAtomic: "0",
      calldata,
      success: true,
      blockNumber: "100",
      blockHash: hash("3"),
      transactionIndex: 2,
      logs: [{ address: target, topics: [hash("2")], data: "0x" }],
    },
    currentBlockNumber: "101",
    canonicalBlockHash: hash("3"),
    requiredConfirmations: 2,
  };
}

describe("general asset V4 receipt reconciliation", () => {
  it("accepts only an exactly attributed, canonical, sufficiently final receipt", () => {
    expect(reconcileReceiptV4(input())).toMatchObject({ status: "finalized" });
    expect(reconcileReceiptV4({ ...input(), currentBlockNumber: "100" }))
      .toEqual({ status: "pending" });
  });

  it.each([
    ["CHAIN_MISMATCH", { observed: { chainId: 1 } }],
    ["TRANSACTION_MISMATCH", { observed: { transactionHash: hash("9") } }],
    ["SENDER_MISMATCH", { observed: { sender: target } }],
    ["NONCE_MISMATCH", { observed: { nonce: "8" } }],
    ["TARGET_MISMATCH", { observed: { target: owner } }],
    ["VALUE_MISMATCH", { observed: { valueAtomic: "1" } }],
    ["CALLDATA_MISMATCH", { observed: { calldata: "0x87654321" } }],
    ["LOG_MISMATCH", { observed: { logs: [] } }],
    ["RECEIPT_REVERTED", { observed: { success: false } }],
    ["RECEIPT_REORGED", { canonicalBlockHash: hash("8") }],
  ])("returns %s instead of accepting altered evidence", (code, change) => {
    const base = input();
    const changed = {
      ...base,
      ...change,
      observed: { ...base.observed, ...(change as { observed?: object }).observed },
    };
    expect(reconcileReceiptV4(changed)).toEqual({
      status: "reconciliation_required",
      code,
    });
  });

  it("requires the exact final token and minimum output increase", () => {
    const output = {
      expected: { token, minimumIncreaseAtomic: "100" },
      observed: { token, beforeAtomic: "50", afterAtomic: "149" },
    };
    expect(reconcileReceiptV4({ ...input(), output })).toEqual({
      status: "reconciliation_required",
      code: "FINAL_OUTPUT_MISMATCH",
    });
    expect(reconcileReceiptV4({
      ...input(),
      output: { ...output, observed: { ...output.observed, afterAtomic: "150" } },
    })).toMatchObject({ status: "finalized" });
  });
});
