import { describe, expect, it } from "vitest";
import {
  aUsdt0,
  pool,
  ScriptedReadClient,
  successfulReceipt,
  testBlockHash,
  transactionHash,
} from "./engine.test-fixture";
import { prepareNextGuidedStepV2, resolveGuidedStepV2 } from "./guided-session";
import {
  directPlan,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  OUTPUT_ATOMIC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";
import type { ConfirmedOwnerTransactionV2 } from "./engine-types";

function confirmed(label: ConfirmedOwnerTransactionV2["label"], stateCheck: ConfirmedOwnerTransactionV2["stateCheck"]) {
  return {
    label,
    hash: transactionHash(label.length),
    preBlockNumber: 80n,
    preBlockHash: testBlockHash(80n),
    blockNumber: 81n,
    blockHash: testBlockHash(81n),
    transactionIndex: 0,
    status: "success" as const,
    gasEstimate: 21_000n,
    protocolEvidence: stateCheck.kind === "swap"
      ? {
        kind: "swap" as const,
        sender: "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const,
        recipient: "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const,
        inputAtomic: INPUT_ATOMIC,
        outputAtomic: OUTPUT_ATOMIC,
      }
      : {
        kind: "approval" as const,
        owner: "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const,
        spender: pool,
        amountAtomic: INPUT_ATOMIC,
      },
    stateCheck,
  } satisfies ConfirmedOwnerTransactionV2;
}

async function input(plan: unknown, read: ScriptedReadClient) {
  return { ...await verifiedExecutionInput(plan), nowSec: NOW_SEC, readClient: read };
}

describe("guided route session", () => {
  it("prepares only the next direct approval, then the Aave supply", async () => {
    const read = new ScriptedReadClient([]);
    read.latestBlocks.push(90n, 91n);
    read.allowance(usdt0, pool, 90n, 0n);
    const first = await prepareNextGuidedStepV2(await input(directPlan, read), []);
    expect(first).toMatchObject({ kind: "prepared", phase: "initial" });
    if (first.kind !== "prepared") throw new Error("Expected approval");
    expect(first.transaction.label).toBe("approve-aave-exact");

    read.allowance(usdt0, pool, 91n, INPUT_ATOMIC);
    read.balance(usdt0, 91n, 100_000_000n);
    read.scaledBalance(aUsdt0, 91n, 0n);
    const approval = confirmed("approve-aave-exact", {
      kind: "allowance", token: usdt0, spender: pool,
      beforeAtomic: 0n, afterAtomic: INPUT_ATOMIC, expectedAtomic: INPUT_ATOMIC,
    });
    const next = await prepareNextGuidedStepV2(await input(directPlan, read), [approval]);
    expect(next).toMatchObject({ kind: "prepared", transaction: { label: "aave-v3-supply" } });
  });

  it("uses event-attributed swap output for the post-swap approval and capped supply", async () => {
    const read = new ScriptedReadClient([]);
    read.latestBlocks.push(200n);
    read.allowance(usdg, pool, 200n, 0n);
    const swap = confirmed("uniswap-v3-exact-input", {
      kind: "swap", tokenIn: usdt0, tokenOut: usdg,
      inputSpentAtomic: INPUT_ATOMIC, outputDeltaAtomic: OUTPUT_ATOMIC,
      ownerOutputBalanceDeltaAtomic: OUTPUT_ATOMIC + 100n,
      minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC,
    });

    const prepared = await prepareNextGuidedStepV2(await input(swapPlan, read), [swap]);
    expect(prepared).toMatchObject({
      kind: "prepared",
      phase: "post-swap",
      authorizedAmountAtomic: OUTPUT_ATOMIC,
      transaction: { label: "approve-aave-exact", to: usdg },
    });
  });

  it("resolves a persisted exact submitted step without issuing another send", async () => {
    const read = new ScriptedReadClient([]);
    const hash = transactionHash(44);
    read.latestBlocks.push(300n, 302n);
    read.allowance(usdt0, pool, 300n, 0n);
    const prepared = await prepareNextGuidedStepV2(await input(directPlan, read), []);
    if (prepared.kind !== "prepared") throw new Error("Expected prepared step");
    read.register(hash, {
      from: prepared.transaction.from,
      to: prepared.transaction.to,
      value: "0x0",
      data: prepared.transaction.data,
      nonce: prepared.expectedNonce,
    });
    read.receipts(hash, successfulReceipt(301n));
    read.allowance(usdt0, pool, 301n, INPUT_ATOMIC);

    const result = await resolveGuidedStepV2({
      ...await input(directPlan, read),
      prepared,
      transactionHash: hash,
      waitForReceiptPoll: async () => {},
    });
    expect(result).toMatchObject({ status: "confirmed", transaction: { hash } });
  });
});
