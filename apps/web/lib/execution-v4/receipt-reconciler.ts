import type { Address, Hash, Hex } from "viem";

export interface ReceiptLogV4 {
  address: Address;
  topics: Hash[];
  data: Hex;
}

interface ExpectedTransactionV4 {
  chainId: number;
  transactionHash: Hash;
  sender: Address;
  nonce: string;
  target: Address;
  valueAtomic: string;
  calldata: Hex;
  logs: ReceiptLogV4[];
}

export interface ObservedReceiptV4 extends ExpectedTransactionV4 {
  success: boolean;
  blockNumber: string;
  blockHash: Hash;
  transactionIndex: number;
}

export interface ReceiptReconciliationInputV4 {
  expected: ExpectedTransactionV4;
  observed: ObservedReceiptV4;
  currentBlockNumber: string;
  canonicalBlockHash: Hash;
  requiredConfirmations: number;
  output?: {
    expected: { token: Address; minimumIncreaseAtomic: string };
    observed: { token: Address; beforeAtomic: string; afterAtomic: string };
  };
}

export type ReceiptReconciliationCodeV4 =
  | "CHAIN_MISMATCH"
  | "TRANSACTION_MISMATCH"
  | "SENDER_MISMATCH"
  | "NONCE_MISMATCH"
  | "TARGET_MISMATCH"
  | "VALUE_MISMATCH"
  | "CALLDATA_MISMATCH"
  | "LOG_MISMATCH"
  | "RECEIPT_REVERTED"
  | "RECEIPT_REORGED"
  | "RECEIPT_MALFORMED"
  | "FINAL_OUTPUT_MISMATCH";

export type ReceiptReconciliationResultV4 =
  | { status: "pending" }
  | { status: "finalized"; receipt: ObservedReceiptV4 }
  | { status: "reconciliation_required"; code: ReceiptReconciliationCodeV4 };

const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function sameLogs(left: ReceiptLogV4[], right: ReceiptLogV4[]): boolean {
  return left.length === right.length && left.every((log, index) => {
    const candidate = right[index];
    return candidate !== undefined && same(log.address, candidate.address) &&
      same(log.data, candidate.data) && log.topics.length === candidate.topics.length &&
      log.topics.every((topic, topicIndex) => same(topic, candidate.topics[topicIndex]!));
  });
}

function mismatch(input: ReceiptReconciliationInputV4): ReceiptReconciliationCodeV4 | null {
  const { expected, observed } = input;
  if (observed.chainId !== expected.chainId) return "CHAIN_MISMATCH";
  if (!same(observed.transactionHash, expected.transactionHash)) return "TRANSACTION_MISMATCH";
  if (!same(observed.sender, expected.sender)) return "SENDER_MISMATCH";
  if (observed.nonce !== expected.nonce) return "NONCE_MISMATCH";
  if (!same(observed.target, expected.target)) return "TARGET_MISMATCH";
  if (observed.valueAtomic !== expected.valueAtomic) return "VALUE_MISMATCH";
  if (!same(observed.calldata, expected.calldata)) return "CALLDATA_MISMATCH";
  if (!sameLogs(observed.logs, expected.logs)) return "LOG_MISMATCH";
  if (!observed.success) return "RECEIPT_REVERTED";
  if (!same(observed.blockHash, input.canonicalBlockHash)) return "RECEIPT_REORGED";
  return null;
}

function outputMatches(output: NonNullable<ReceiptReconciliationInputV4["output"]>): boolean {
  if (!same(output.expected.token, output.observed.token)) return false;
  try {
    const before = BigInt(output.observed.beforeAtomic);
    const after = BigInt(output.observed.afterAtomic);
    const minimum = BigInt(output.expected.minimumIncreaseAtomic);
    return before >= 0n && after >= before && minimum > 0n && after - before >= minimum;
  } catch {
    return false;
  }
}

export function reconcileReceiptV4(
  input: ReceiptReconciliationInputV4,
): ReceiptReconciliationResultV4 {
  const code = mismatch(input);
  if (code) return { status: "reconciliation_required", code };
  let receiptBlock: bigint;
  let currentBlock: bigint;
  try {
    receiptBlock = BigInt(input.observed.blockNumber);
    currentBlock = BigInt(input.currentBlockNumber);
  } catch {
    return { status: "reconciliation_required", code: "RECEIPT_MALFORMED" };
  }
  if (!Number.isSafeInteger(input.observed.transactionIndex) ||
      input.observed.transactionIndex < 0 || receiptBlock < 0n || currentBlock < receiptBlock ||
      !Number.isInteger(input.requiredConfirmations) || input.requiredConfirmations < 1) {
    return { status: "reconciliation_required", code: "RECEIPT_MALFORMED" };
  }
  if (currentBlock - receiptBlock + 1n < BigInt(input.requiredConfirmations)) {
    return { status: "pending" };
  }
  if (input.output && !outputMatches(input.output)) {
    return { status: "reconciliation_required", code: "FINAL_OUTPUT_MISMATCH" };
  }
  return { status: "finalized", receipt: input.observed };
}
