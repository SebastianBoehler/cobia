import type { Address, Hash } from "viem";
import type { ReceiptLogV4 } from "./receipt-reconciler";

type ChainId = 1 | 196;

export interface BridgeTransactionReceiptV4 {
  transactionHash: Hash;
  success: boolean;
  blockNumber: string;
  blockHash: Hash;
  transactionIndex: number;
  logs: ReceiptLogV4[];
}

export interface DeliveryLocatorV4 {
  sourceTransactionHash: Hash;
  destinationChainId: ChainId;
  messageId: Hash;
  deliveryTransactionHash: Hash;
}

export interface BridgeDeliveryMonitorV4 {
  locate(input: { sourceChainId: ChainId; sourceTransactionHash: Hash;
    destinationChainId: ChainId }): Promise<DeliveryLocatorV4 | undefined>;
  semantics: BridgeDeliveryVerificationInputV4["semantics"];
  reader: BridgeDeliveryVerificationInputV4["reader"];
}

export interface BridgeDeliveryVerificationInputV4 {
  expected: {
    sourceChainId: ChainId;
    sourceTransactionHash: Hash;
    destinationChainId: ChainId;
    recipient: Address;
    token: Address;
    minimumAtomic: string;
    requiredConfirmations: number;
  };
  sourceReceipt: BridgeTransactionReceiptV4;
  locator?: DeliveryLocatorV4;
  semantics: {
    sourceMessageId(receipt: BridgeTransactionReceiptV4): Hash | null;
    destinationDelivery(receipt: BridgeTransactionReceiptV4): null | {
      messageId: Hash;
      recipient: Address;
      token: Address;
      amountAtomic: string;
      emitter: Address;
      emitterRuntimeCodeHash: Hash;
    };
  };
  reader: {
    receipt(chainId: ChainId, transactionHash: Hash): Promise<BridgeTransactionReceiptV4 | undefined>;
    canonicalBlockHash(chainId: ChainId, blockNumber: string): Promise<Hash>;
    currentBlockNumber(chainId: ChainId): Promise<string>;
    tokenBalance(chainId: ChainId, token: Address, owner: Address, blockNumber: string): Promise<string>;
    codeHash(chainId: ChainId, address: Address, blockNumber: string): Promise<Hash | null>;
  };
}

type FailureCode = "BRIDGE_DELIVERY_MISMATCH" | "BRIDGE_SOURCE_REORGED" |
  "BRIDGE_DESTINATION_REORGED";

export type BridgeDeliveryVerificationResultV4 =
  | { status: "pending" }
  | { status: "reconciliation_required"; code: FailureCode }
  | { status: "verified"; evidence: {
    messageId: Hash;
    sourceTransactionHash: Hash;
    sourceBlockNumber: string;
    sourceBlockHash: Hash;
    destinationChainId: ChainId;
    recipient: Address;
    token: Address;
    amountAtomic: string;
    deliveryTransactionHash: Hash;
    destinationBlockNumber: string;
    destinationBlockHash: Hash;
  } };

const mismatch = (code: FailureCode): BridgeDeliveryVerificationResultV4 =>
  ({ status: "reconciliation_required", code });

function final(receiptBlock: string, currentBlock: string, confirmations: number): boolean {
  try {
    const receipt = BigInt(receiptBlock);
    const current = BigInt(currentBlock);
    return Number.isInteger(confirmations) && confirmations > 0 && receipt > 0n &&
      current >= receipt && current - receipt + 1n >= BigInt(confirmations);
  } catch {
    return false;
  }
}

export async function verifyBridgeDeliveryV4(
  input: BridgeDeliveryVerificationInputV4,
): Promise<BridgeDeliveryVerificationResultV4> {
  const { expected, sourceReceipt } = input;
  if (sourceReceipt.transactionHash !== expected.sourceTransactionHash || !sourceReceipt.success) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  const sourceCanonical = await input.reader.canonicalBlockHash(expected.sourceChainId,
    sourceReceipt.blockNumber);
  if (sourceCanonical !== sourceReceipt.blockHash) return mismatch("BRIDGE_SOURCE_REORGED");
  if (!input.locator) return { status: "pending" };
  const locator = input.locator;
  if (locator.sourceTransactionHash !== expected.sourceTransactionHash ||
      locator.destinationChainId !== expected.destinationChainId) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  const sourceMessageId = input.semantics.sourceMessageId(sourceReceipt);
  if (!sourceMessageId || sourceMessageId !== locator.messageId) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  const destination = await input.reader.receipt(expected.destinationChainId,
    locator.deliveryTransactionHash);
  if (!destination) return { status: "pending" };
  if (destination.transactionHash !== locator.deliveryTransactionHash || !destination.success) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  const [destinationCanonical, currentBlock] = await Promise.all([
    input.reader.canonicalBlockHash(expected.destinationChainId, destination.blockNumber),
    input.reader.currentBlockNumber(expected.destinationChainId),
  ]);
  if (destinationCanonical !== destination.blockHash) return mismatch("BRIDGE_DESTINATION_REORGED");
  if (!final(destination.blockNumber, currentBlock, expected.requiredConfirmations)) {
    return { status: "pending" };
  }
  const delivered = input.semantics.destinationDelivery(destination);
  if (!delivered || delivered.messageId !== locator.messageId ||
      delivered.recipient !== expected.recipient || delivered.token !== expected.token) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  if (await input.reader.codeHash(expected.destinationChainId, delivered.emitter,
    destination.blockNumber) !== delivered.emitterRuntimeCodeHash) {
    return mismatch("BRIDGE_DESTINATION_REORGED");
  }
  let before: bigint;
  let after: bigint;
  let amount: bigint;
  try {
    if (BigInt(destination.blockNumber) === 0n) throw new Error("invalid block");
    const balances = await Promise.all([
      input.reader.tokenBalance(expected.destinationChainId, expected.token, expected.recipient,
        (BigInt(destination.blockNumber) - 1n).toString()),
      input.reader.tokenBalance(expected.destinationChainId, expected.token, expected.recipient,
        destination.blockNumber),
    ]);
    [before, after] = balances.map(BigInt) as [bigint, bigint];
    amount = BigInt(delivered.amountAtomic);
  } catch {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  const minimum = BigInt(expected.minimumAtomic);
  if (minimum <= 0n || amount < minimum || after < before || after - before < minimum) {
    return mismatch("BRIDGE_DELIVERY_MISMATCH");
  }
  return { status: "verified", evidence: {
    messageId: locator.messageId,
    sourceTransactionHash: expected.sourceTransactionHash,
    sourceBlockNumber: sourceReceipt.blockNumber,
    sourceBlockHash: sourceReceipt.blockHash,
    destinationChainId: expected.destinationChainId,
    recipient: expected.recipient,
    token: expected.token,
    amountAtomic: amount.toString(),
    deliveryTransactionHash: locator.deliveryTransactionHash,
    destinationBlockNumber: destination.blockNumber,
    destinationBlockHash: destination.blockHash,
  } };
}
