import { describe, expect, it } from "vitest";
import { rayDivFloor, rayMulFloor } from "../adapters/aave-math";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { executeRoutePlanV2 } from "./execute-route";
import {
  aUsdg,
  aUsdt0,
  pool,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  directPlan,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function input(wallet: ScriptedWallet, read: ScriptedReadClient) {
  wallet.connectReadClient(read);
  return {
    ...await verifiedExecutionInput(directPlan),
    wallet,
    readClient: read,
    nowSec: () => NOW_SEC,
    waitForReceiptPoll: async () => {},
  };
}

describe("execution receipt authority and recovery", () => {
  it("attributes the receipt and transaction before accepting a confirmed step", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(72);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.allowance(usdt0, pool, 100n, 0n);
    read.receipts(hash, successfulReceipt(100n));
    read.transactionChanges.set(hash, { input: "0x" });

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "failed",
      submitted: { hash },
      failure: { code: "receipt-attribution" },
    });
    expect(wallet.sendCount).toBe(1);
  });

  it("rejects a receipt block orphaned before the first confirmation", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(73);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.receipts(hash, successfulReceipt(100n));
    read.blockHashChanges.set(100n, `0x${"ef".repeat(32)}`);

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "receipt-reorged" },
    });
  });

  it("re-pins pool, asset, and aToken deployments before estimating supply", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);
    read.normalizedIncome(usdt0, 90n, 10n ** 27n);
    read.runtimeCodeHashes.set(pool.toLowerCase(), `0x${"ff".repeat(32)}`);

    await expect(executeRoutePlanV2(await input(wallet, read))).rejects.toThrow(
      "runtime code hash mismatch",
    );
    expect(wallet.estimateCount).toBe(0);
    expect(wallet.sendCount).toBe(0);
  });

  it("re-pins the Aave Pool proxy implementation before estimating supply", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.implementationSlots.set(
      pool.toLowerCase(),
      `0x${"0".repeat(24)}${aUsdt0.slice(2).toLowerCase()}`,
    );

    await expect(executeRoutePlanV2(await input(wallet, read))).rejects.toThrow(
      "implementation identity mismatch",
    );
    expect(wallet.estimateCount).toBe(0);
    expect(PROTOCOL_REGISTRY.aaveV3.pool.implementation).toBeDefined();
  });

  it("requires Aave Supply and Mint events and reports scaled/index telemetry", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(74);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);
    read.normalizedIncome(usdt0, 90n, 10n ** 27n);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, INPUT_ATOMIC);
    read.normalizedIncome(usdt0, 100n, 10n ** 27n);
    read.receipts(hash, successfulReceipt(100n));

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "success",
      transactions: [{
        protocolEvidence: {
          kind: "aave-supply",
          suppliedAtomic: INPUT_ATOMIC,
          mintValueAtomic: INPUT_ATOMIC,
          mintIndexRay: 10n ** 27n,
        },
        stateCheck: {
          kind: "aave-supply",
          scaledATokenDeltaAtomic: INPUT_ATOMIC,
          normalizedIncomeAfterRay: 10n ** 27n,
        },
      }],
    });
  });

  it("accepts the deployed Aave floor-rounded Mint amount", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(79);
    const index = 1_000_964_827_567_964_239_720_386_555n;
    const scaled = rayDivFloor(INPUT_ATOMIC, index);
    const minted = rayMulFloor(scaled, index);
    expect(minted).toBe(INPUT_ATOMIC - 1n);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);
    read.normalizedIncome(usdt0, 90n, index);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, scaled);
    read.normalizedIncome(usdt0, 100n, index);
    read.aaveMintIndexOverrides.set(hash, index);
    read.receipts(hash, successfulReceipt(100n));

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "success",
      transactions: [{
        protocolEvidence: {
          suppliedAtomic: INPUT_ATOMIC,
          mintValueAtomic: minted,
          mintIndexRay: index,
        },
        stateCheck: { scaledATokenDeltaAtomic: scaled },
      }],
    });
  });

  it("accepts aggregate Mint rounding for an existing aToken balance", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(80);
    const index = 1_000_964_827_567_964_239_720_386_555n;
    const scaledBefore = 126n;
    const scaledAmount = rayDivFloor(INPUT_ATOMIC, index);
    const principalMint = rayMulFloor(scaledBefore + scaledAmount, index) -
      rayMulFloor(scaledBefore, index);
    expect(principalMint).toBe(INPUT_ATOMIC);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, scaledBefore);
    read.normalizedIncome(usdt0, 90n, index);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, scaledBefore + scaledAmount);
    read.normalizedIncome(usdt0, 100n, index);
    read.aaveMintIndexOverrides.set(hash, index);
    read.aaveScaledBalanceBeforeOverrides.set(hash, scaledBefore);
    read.receipts(hash, successfulReceipt(100n));

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "success",
      transactions: [{
        protocolEvidence: {
          suppliedAtomic: INPUT_ATOMIC,
          mintValueAtomic: principalMint,
          mintIndexRay: index,
        },
        stateCheck: { scaledATokenDeltaAtomic: scaledAmount },
      }],
    });
  });

  it("rejects an Aave Mint index that disagrees with receipt-block normalized income", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(78);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);
    read.normalizedIncome(usdt0, 90n, 10n ** 27n);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, INPUT_ATOMIC);
    read.normalizedIncome(usdt0, 100n, 10n ** 27n + 1n);
    read.receipts(hash, successfulReceipt(100n));

    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "failed",
      failure: {
        code: "state-postcondition",
        message: expect.stringContaining("Mint index"),
      },
    });
  });

  it("uses pool-event output, not a contaminated owner balance delta, for staged supply", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const [swapHash, supplyHash] = [75, 76].map(transactionHash);
    wallet.hashes.push(swapHash, supplyHash);
    read.latestBlocks.push(200n, 200n, 202n, 201n, 203n);
    const router = "0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA";
    read.allowance(usdt0, router, 200n, INPUT_ATOMIC);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 50_000_000n);
    const contaminatedBalance = 10_000_000n + 10n ** 18n;
    read.balance(usdg, 201n, contaminatedBalance);
    read.allowance(usdg, pool, 201n, MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 201n, 0n);
    read.balance(usdg, 202n, contaminatedBalance - MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 202n, MINIMUM_OUTPUT_ATOMIC);
    read.receipts(swapHash, successfulReceipt(201n));
    read.receipts(supplyHash, successfulReceipt(202n));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);

    const executionInput = {
      ...await verifiedExecutionInput(swapPlan),
      wallet,
      readClient: read,
      nowSec: () => NOW_SEC,
      waitForReceiptPoll: async () => {},
    };
    wallet.connectReadClient(read);
    const result = await executeRoutePlanV2(executionInput);

    expect(result).toMatchObject({
      status: "success",
      transactions: [
        {
          stateCheck: {
            kind: "swap",
            outputDeltaAtomic: MINIMUM_OUTPUT_ATOMIC,
            ownerOutputBalanceDeltaAtomic: 10n ** 18n,
          },
        },
        {
          stateCheck: {
            kind: "aave-supply",
            suppliedAtomic: MINIMUM_OUTPUT_ATOMIC,
          },
        },
      ],
    });
  });
});
