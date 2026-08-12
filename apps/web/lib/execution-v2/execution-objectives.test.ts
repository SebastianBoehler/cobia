import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { executeRoutePlanV2 } from "./execute-route";
import {
  router,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  FINAL_QUOTE_ATOMIC,
  profitExecutionFixture,
  RETURN_INPUT_ATOMIC,
} from "./profit-test-fixture";
import {
  executionPolicy,
  executionSnapshot,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  OUTPUT_ATOMIC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function input(
  routePlan: unknown,
  policy: Parameters<typeof verifiedExecutionInput>[1],
  snapshot: Parameters<typeof verifiedExecutionInput>[2],
  wallet: ScriptedWallet,
  readClient: ScriptedReadClient,
) {
  wallet.connectReadClient(readClient);
  const verified = await verifiedExecutionInput(routePlan, policy, snapshot);
  return { ...verified, nowSec: () => NOW_SEC, wallet, readClient, waitForReceiptPoll: async () => {} };
}

describe("executeRoutePlanV2 atomic objectives", () => {
  it("finishes a terminal Swap after the attributed output meets its signed minimum", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(41);
    wallet.hashes.push(hash);
    read.latestBlocks.push(400n, 400n, 402n);
    read.allowance(usdt0, router, 400n, INPUT_ATOMIC);
    read.balance(usdt0, 400n, INPUT_ATOMIC);
    read.balance(usdg, 400n, 0n);
    read.balance(usdt0, 401n, 0n);
    read.balance(usdg, 401n, OUTPUT_ATOMIC);
    read.receipts(hash, successfulReceipt(401n));
    const routePlan = {
      ...swapPlan,
      inputAtomic: INPUT_ATOMIC.toString(),
      retainedAtomic: "0",
      legs: [{ ...swapPlan.legs[0], actions: [swapPlan.legs[0].actions[0]] }],
    } as const;
    const policy = {
      ...executionPolicy,
      principalAtomic: INPUT_ATOMIC.toString(),
      protocolExposureBps: 10_000,
      objective: {
        kind: "swap" as const,
        outputAsset: usdg.toLowerCase() as Address,
        minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC.toString(),
      },
    };

    const result = await executeRoutePlanV2(await input(
      routePlan, policy, executionSnapshot, wallet, read,
    ));

    expect(result.status).toBe("success");
    expect(result.transactions.map(({ label }) => label)).toEqual(["uniswap-v3-exact-input"]);
    expect(result.transactions[0]?.stateCheck).toMatchObject({
      kind: "swap",
      outputDeltaAtomic: OUTPUT_ATOMIC,
    });
  });

  it("executes a bounded Profit round trip and attributes the final balance", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const [firstHash, returnHash] = [51, 52].map(transactionHash);
    wallet.hashes.push(firstHash, returnHash);
    read.latestBlocks.push(500n, 500n, 502n, 501n, 503n);
    read.allowance(usdt0, router, 500n, INPUT_ATOMIC);
    read.allowance(usdg, router, 501n, RETURN_INPUT_ATOMIC);
    read.balance(usdt0, 500n, INPUT_ATOMIC);
    read.balance(usdg, 500n, 0n);
    read.balance(usdt0, 501n, 0n);
    read.balance(usdg, 501n, OUTPUT_ATOMIC);
    read.balance(usdt0, 502n, FINAL_QUOTE_ATOMIC);
    read.balance(usdg, 502n, OUTPUT_ATOMIC - RETURN_INPUT_ATOMIC);
    read.swapOutputOverrides.set(returnHash, FINAL_QUOTE_ATOMIC);
    read.receipts(firstHash, successfulReceipt(501n));
    read.receipts(returnHash, successfulReceipt(502n));
    const fixture = profitExecutionFixture();

    const result = await executeRoutePlanV2(await input(
      fixture.routePlan, fixture.policy, fixture.snapshot, wallet, read,
    ));

    expect(result.status).toBe("success");
    expect(result.transactions.map(({ label }) => label)).toEqual([
      "uniswap-v3-exact-input", "uniswap-v3-exact-input",
    ]);
    expect(result.transactions[1]?.stateCheck).toMatchObject({
      kind: "swap",
      inputSpentAtomic: RETURN_INPUT_ATOMIC,
      outputDeltaAtomic: FINAL_QUOTE_ATOMIC,
      minimumOutputAtomic: 50_100_000n,
    });
  });
});
