import { describe, expect, it } from "vitest";
import { executeRoutePlanV2 } from "./execute-route";
import {
  pool,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  testBlockHash,
  transactionHash,
} from "./engine.test-fixture";
import {
  directPlan,
  NOW_SEC,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function scenario(byte: number) {
  const events: string[] = [];
  const read = new ScriptedReadClient(events);
  const wallet = new ScriptedWallet(events);
  wallet.connectReadClient(read);
  const hash = transactionHash(byte);
  wallet.hashes.push(hash);
  read.latestBlocks.push(90n, 90n, 101n);
  read.allowance(usdt0, pool, 90n, 1n);
  read.allowance(usdt0, pool, 100n, 0n);
  read.receipts(hash, successfulReceipt(100n));
  return {
    hash,
    read,
    wallet,
    input: {
      ...await verifiedExecutionInput(directPlan),
      wallet,
      readClient: read,
      nowSec: () => NOW_SEC,
      waitForReceiptPoll: async () => {},
    },
  };
}

describe("submitted transaction attribution", () => {
  it.each([
    ["receipt hash", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.receiptChanges.set(hash, { transactionHash: transactionHash(99) });
    }],
    ["receipt sender", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.receiptChanges.set(hash, {
        from: "0x2222222222222222222222222222222222222222",
      });
    }],
    ["receipt target", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.receiptChanges.set(hash, {
        to: "0x2222222222222222222222222222222222222222",
      });
    }],
    ["transaction input", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.transactionChanges.set(hash, { input: "0x" });
    }],
    ["transaction block hash", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.transactionChanges.set(hash, { blockHash: testBlockHash(999n) });
    }],
    ["transaction index", (read: ScriptedReadClient, hash: `0x${string}`) => {
      read.transactionChanges.set(hash, { transactionIndex: 1 });
    }],
  ] as const)("rejects a mismatched %s", async (_, mutate) => {
    const test = await scenario(81);
    mutate(test.read, test.hash);

    const result = await executeRoutePlanV2(test.input);

    expect(result).toMatchObject({
      status: "failed",
      submitted: { hash: test.hash },
      failure: { code: "receipt-attribution" },
    });
    expect(test.wallet.sendCount).toBe(1);
  });

  it("rejects a mined transaction with nonzero native value", async () => {
    const test = await scenario(84);
    test.read.transactionChanges.set(test.hash, { value: 1n } as never);

    const result = await executeRoutePlanV2(test.input);

    expect(result).toMatchObject({
      status: "failed",
      submitted: { hash: test.hash },
      failure: { code: "receipt-attribution" },
    });
  });

  it("rejects a transaction already mined in the captured preflight block", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    wallet.connectReadClient(read);
    const hash = transactionHash(89);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 91n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.receipts(hash, successfulReceipt(90n));

    const result = await executeRoutePlanV2({
      ...await verifiedExecutionInput(directPlan),
      wallet,
      readClient: read,
      nowSec: () => NOW_SEC,
      waitForReceiptPoll: async () => {},
    });

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "receipt-attribution" },
    });
  });

  it("requires the step-specific protocol event before state reads authorize it", async () => {
    const test = await scenario(82);
    test.read.missingProtocolLogs.add(test.hash);

    const result = await executeRoutePlanV2(test.input);

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "protocol-event-missing" },
    });
  });

  it("keeps a mined hash pending until its receipt block has one confirmation", async () => {
    const test = await scenario(83);
    test.read.latestBlocks.splice(2, 1, ...Array<bigint>(12).fill(100n));
    let waits = 0;

    const result = await executeRoutePlanV2({
      ...test.input,
      waitForReceiptPoll: async () => { waits += 1; },
    });

    expect(result).toMatchObject({
      status: "pending",
      submitted: { hash: test.hash },
      resume: { kind: "submitted-hash" },
    });
    expect(waits).toBe(11);
  });
});
