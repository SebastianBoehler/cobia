import { isAddressEqual } from "viem";
import { ExecutionStepErrorV2 } from "./execution-errors";
import type {
  ExecutionReadClientV2,
  ExecutionReceiptV2,
  ExecutionResumeCheckpointV2,
  ExecutionTransactionV2,
} from "./engine-types";

const MAX_RECEIPT_POLLS = 12;
const MIN_CONFIRMATIONS = 1n;

export type ReceiptPollWaitV2 = () => Promise<void>;

export async function defaultReceiptPollWaitV2(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

function sameHash(left: string | null, right: string | null): boolean {
  return left?.toLowerCase() === right?.toLowerCase();
}

function assertAttribution(
  checkpoint: ExecutionResumeCheckpointV2,
  receipt: ExecutionReceiptV2,
  transaction: ExecutionTransactionV2,
): void {
  const expected = checkpoint.transaction;
  if (!sameHash(receipt.transactionHash, checkpoint.submitted.hash) ||
    !sameHash(transaction.hash, checkpoint.submitted.hash) ||
    !isAddressEqual(receipt.from, checkpoint.owner) ||
    !isAddressEqual(transaction.from, checkpoint.owner) ||
    !receipt.to || !transaction.to ||
    !isAddressEqual(receipt.to, expected.to) ||
    !isAddressEqual(transaction.to, expected.to) ||
    transaction.value !== expected.value ||
    transaction.input.toLowerCase() !== expected.data.toLowerCase() ||
    receipt.blockNumber <= checkpoint.submitted.preBlockNumber ||
    transaction.blockNumber !== receipt.blockNumber ||
    !sameHash(transaction.blockHash, receipt.blockHash) ||
    transaction.transactionIndex !== receipt.transactionIndex ||
    !Number.isSafeInteger(receipt.transactionIndex) || receipt.transactionIndex < 0) {
    throw new ExecutionStepErrorV2(
      "receipt-attribution",
      "Receipt or transaction does not belong to the submitted owner call",
    );
  }
}

async function canonicalReceiptBlock(
  client: ExecutionReadClientV2,
  receipt: ExecutionReceiptV2,
): Promise<void> {
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.number !== receipt.blockNumber || !block.hash ||
    !sameHash(block.hash, receipt.blockHash)) {
    throw new ExecutionStepErrorV2(
      "receipt-reorged",
      "Receipt block is no longer canonical",
    );
  }
}

async function firstReceipt(
  client: ExecutionReadClientV2,
  checkpoint: ExecutionResumeCheckpointV2,
  wait: ReceiptPollWaitV2,
): Promise<ExecutionReceiptV2 | undefined> {
  for (let attempt = 0; attempt < MAX_RECEIPT_POLLS; attempt += 1) {
    const receipt = await client.getReceipt(checkpoint.submitted.hash);
    if (receipt) return receipt;
    if (attempt + 1 < MAX_RECEIPT_POLLS) await wait();
  }
  return undefined;
}

async function hasConfirmation(
  client: ExecutionReadClientV2,
  receipt: ExecutionReceiptV2,
  wait: ReceiptPollWaitV2,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RECEIPT_POLLS; attempt += 1) {
    if (await client.getBlockNumber() >= receipt.blockNumber + MIN_CONFIRMATIONS) return true;
    if (attempt + 1 < MAX_RECEIPT_POLLS) await wait();
  }
  return false;
}

export async function resolveCanonicalReceiptV2(input: {
  readClient: ExecutionReadClientV2;
  checkpoint: ExecutionResumeCheckpointV2;
  waitForReceiptPoll?: ReceiptPollWaitV2;
}): Promise<ExecutionReceiptV2 | undefined> {
  const wait = input.waitForReceiptPoll ?? defaultReceiptPollWaitV2;
  const receipt = await firstReceipt(input.readClient, input.checkpoint, wait);
  if (!receipt) return undefined;
  const transaction = await input.readClient.getTransaction(input.checkpoint.submitted.hash);
  if (!transaction) {
    throw new ExecutionStepErrorV2(
      "receipt-attribution",
      "Mined transaction body is unavailable",
    );
  }
  assertAttribution(input.checkpoint, receipt, transaction);
  await canonicalReceiptBlock(input.readClient, receipt);
  if (!(await hasConfirmation(input.readClient, receipt, wait))) return undefined;

  const [confirmedReceipt, confirmedTransaction] = await Promise.all([
    input.readClient.getReceipt(input.checkpoint.submitted.hash),
    input.readClient.getTransaction(input.checkpoint.submitted.hash),
  ]);
  if (!confirmedReceipt || !confirmedTransaction ||
    !sameHash(confirmedReceipt.blockHash, receipt.blockHash) ||
    confirmedReceipt.blockNumber !== receipt.blockNumber ||
    confirmedReceipt.transactionIndex !== receipt.transactionIndex) {
    throw new ExecutionStepErrorV2(
      "receipt-reorged",
      "Receipt changed before confirmation",
    );
  }
  assertAttribution(input.checkpoint, confirmedReceipt, confirmedTransaction);
  await canonicalReceiptBlock(input.readClient, confirmedReceipt);
  return confirmedReceipt;
}

export async function assertReceiptStillCanonicalV2(input: {
  readClient: ExecutionReadClientV2;
  checkpoint: ExecutionResumeCheckpointV2;
  expectedReceipt: ExecutionReceiptV2;
}): Promise<void> {
  const [receipt, transaction, preflightBlock] = await Promise.all([
    input.readClient.getReceipt(input.checkpoint.submitted.hash),
    input.readClient.getTransaction(input.checkpoint.submitted.hash),
    input.readClient.getBlock({
      blockNumber: input.checkpoint.submitted.preBlockNumber,
    }),
  ]);
  if (preflightBlock.number !== input.checkpoint.submitted.preBlockNumber ||
    !preflightBlock.hash ||
    !sameHash(preflightBlock.hash, input.checkpoint.submitted.preBlockHash)) {
    throw new ExecutionStepErrorV2(
      "receipt-reorged",
      "Captured preflight block is no longer canonical",
    );
  }
  if (!receipt || !transaction ||
    !sameHash(receipt.blockHash, input.expectedReceipt.blockHash) ||
    receipt.blockNumber !== input.expectedReceipt.blockNumber ||
    receipt.transactionIndex !== input.expectedReceipt.transactionIndex) {
    throw new ExecutionStepErrorV2(
      "receipt-reorged",
      "Receipt changed during postcondition validation",
    );
  }
  assertAttribution(input.checkpoint, receipt, transaction);
  await canonicalReceiptBlock(input.readClient, receipt);
}
