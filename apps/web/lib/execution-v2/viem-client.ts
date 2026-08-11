import {
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Hash,
  type PublicClient,
} from "viem";
import { createProtocolReadClient } from "../adapters/read-client";
import type {
  ExecutionReadClientV2,
  ExecutionReceiptV2,
  ExecutionTransactionV2,
} from "./engine-types";

type ViemExecutionClient = Pick<
  PublicClient,
  | "getBlock"
  | "getBlockNumber"
  | "getChainId"
  | "getCode"
  | "estimateGas"
  | "getStorageAt"
  | "getTransaction"
  | "getTransactionCount"
  | "getTransactionReceipt"
  | "readContract"
>;

function receiptOutput(
  receipt: Awaited<ReturnType<ViemExecutionClient["getTransactionReceipt"]>>,
): ExecutionReceiptV2 {
  return {
    transactionHash: receipt.transactionHash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    transactionIndex: receipt.transactionIndex,
    from: receipt.from,
    to: receipt.to,
    logs: receipt.logs.map(({ address, data, topics }) => ({ address, data, topics })),
  };
}

function transactionOutput(
  transaction: Awaited<ReturnType<ViemExecutionClient["getTransaction"]>>,
): ExecutionTransactionV2 {
  return {
    hash: transaction.hash,
    from: transaction.from,
    to: transaction.to,
    value: transaction.value,
    input: transaction.input,
    nonce: transaction.nonce,
    blockNumber: transaction.blockNumber,
    blockHash: transaction.blockHash,
    transactionIndex: transaction.transactionIndex,
  };
}

export function createExecutionReadClientV2(
  client: ViemExecutionClient,
): ExecutionReadClientV2 {
  const protocol = createProtocolReadClient(client);
  return {
    ...protocol,
    getBlockNumber: () => client.getBlockNumber(),
    estimateGas: ({ from, nonce, ...request }) => {
      if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Execution nonce is unsafe");
      }
      return client.estimateGas({ account: from, nonce: Number(nonce), ...request });
    },
    async getTransactionCount(address) {
      return BigInt(await client.getTransactionCount({ address, blockTag: "pending" }));
    },
    async getBlockTransactions(blockNumber) {
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      return block.transactions
        .filter((transaction): transaction is Exclude<typeof transaction, Hash> =>
          typeof transaction !== "string")
        .map(transactionOutput);
    },
    async getReceipt(hash: Hash) {
      try {
        return receiptOutput(await client.getTransactionReceipt({ hash }));
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return undefined;
        throw error;
      }
    },
    async getTransaction(hash: Hash) {
      try {
        return transactionOutput(await client.getTransaction({ hash }));
      } catch (error) {
        if (error instanceof TransactionNotFoundError) return undefined;
        throw error;
      }
    },
  };
}
