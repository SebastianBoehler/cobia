import {
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Hash,
} from "viem";
import { describe, expect, it } from "vitest";
import { createExecutionReadClientV2 } from "./viem-client";

const hash = `0x${"ab".repeat(32)}` as Hash;
const blockHash = `0x${"cd".repeat(32)}` as Hash;
const owner = "0x1111111111111111111111111111111111111111" as const;
const target = "0x2222222222222222222222222222222222222222" as const;

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => 196,
    getBlock: async () => ({ number: 10n, hash: blockHash, timestamp: 100n }),
    getCode: async () => "0x01",
    getStorageAt: async () => undefined,
    readContract: async () => 0n,
    getBlockNumber: async () => 10n,
    getTransactionReceipt: async () => ({
      transactionHash: hash,
      status: "success",
      blockNumber: 10n,
      blockHash,
      transactionIndex: 2,
      from: owner,
      to: target,
      logs: [{ address: target, data: "0x", topics: [] }],
    }),
    getTransaction: async () => ({
      hash,
      from: owner,
      to: target,
      value: 0n,
      input: "0x1234",
      blockNumber: 10n,
      blockHash,
      transactionIndex: 2,
    }),
    ...overrides,
  };
}

describe("createExecutionReadClientV2", () => {
  it("maps viem transaction and receipt identity without losing value or logs", async () => {
    const client = createExecutionReadClientV2(fakeClient() as never);

    await expect(client.getReceipt(hash)).resolves.toEqual({
      transactionHash: hash,
      status: "success",
      blockNumber: 10n,
      blockHash,
      transactionIndex: 2,
      from: owner,
      to: target,
      logs: [{ address: target, data: "0x", topics: [] }],
    });
    await expect(client.getTransaction(hash)).resolves.toMatchObject({
      hash,
      value: 0n,
      input: "0x1234",
      blockHash,
    });
  });

  it("maps only viem not-found errors to an unmined result", async () => {
    const client = createExecutionReadClientV2(fakeClient({
      getTransactionReceipt: async () => {
        throw new TransactionReceiptNotFoundError({ hash });
      },
      getTransaction: async () => {
        throw new TransactionNotFoundError({ hash });
      },
    }) as never);

    await expect(client.getReceipt(hash)).resolves.toBeUndefined();
    await expect(client.getTransaction(hash)).resolves.toBeUndefined();
  });

  it("propagates RPC failures instead of treating them as pending", async () => {
    const client = createExecutionReadClientV2(fakeClient({
      getTransactionReceipt: async () => { throw new Error("RPC unavailable"); },
    }) as never);

    await expect(client.getReceipt(hash)).rejects.toThrow("RPC unavailable");
  });
});
