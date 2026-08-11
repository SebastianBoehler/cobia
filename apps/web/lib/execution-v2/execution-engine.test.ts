import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { executeRoutePlanV2 } from "./execute-route";
import {
  aUsdg,
  aUsdt0,
  pool,
  router,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  directPlan,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  lpPlan,
  noActionPlan,
  NOW_SEC,
  OWNER,
  OUTPUT_ATOMIC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function engineInput(
  routePlan: unknown,
  wallet: ScriptedWallet,
  readClient: ScriptedReadClient,
  waitForReceiptPoll = async () => {},
) {
  wallet.connectReadClient(readClient);
  const verified = await verifiedExecutionInput(routePlan);
  return {
    ...verified,
    nowSec: () => NOW_SEC,
    wallet,
    readClient,
    waitForReceiptPoll,
  };
}

function expectEstimateThenAuthorityBeforeEverySend(events: string[]) {
  events.forEach((event, index) => {
    if (event.startsWith("wallet:send:")) {
      expect(events[index - 5]).toBe("wallet:estimate");
      expect(events[index - 4]).toMatch(/^read:block-hash:/);
      expect(events.slice(index - 3, index)).toEqual([
        "wallet:chain", "wallet:accounts", "read:chain",
      ]);
    }
  });
}

describe("executeRoutePlanV2", () => {
  it("returns a verified no-action result without asking the wallet to send", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);

    const result = await executeRoutePlanV2(await engineInput(noActionPlan, wallet, read));

    expect(result).toEqual({
      status: "no-action",
      owner: OWNER,
      chainId: 196,
      transactions: [],
    });
    expect(wallet.estimateCount).toBe(0);
    expect(wallet.sendCount).toBe(0);
  });

  it("executes and validates a reset, exact approval, then direct Aave supply", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const [resetHash, approveHash, supplyHash] = [1, 2, 3].map(transactionHash);
    wallet.hashes.push(resetHash, approveHash, supplyHash);
    read.latestBlocks.push(90n, 90n, 101n, 100n, 102n, 101n, 103n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.allowance(usdt0, pool, 100n, 0n);
    read.allowance(usdt0, pool, 101n, INPUT_ATOMIC);
    read.balance(usdt0, 101n, 100_000_000n);
    read.balance(aUsdt0, 101n, 0n);
    read.balance(usdt0, 102n, 50_000_000n);
    read.balance(aUsdt0, 102n, INPUT_ATOMIC);
    read.receipts(resetHash, undefined, successfulReceipt(100n));
    read.receipts(approveHash, successfulReceipt(101n));
    read.receipts(supplyHash, successfulReceipt(102n));
    let waits = 0;

    const result = await executeRoutePlanV2(await engineInput(
      directPlan,
      wallet,
      read,
      async () => { waits += 1; },
    ));

    expect(result).toMatchObject({ status: "success", owner: OWNER, chainId: 196 });
    expect(result.transactions.map(({ label, hash, blockNumber, status }) => ({
      label, hash, blockNumber, status,
    }))).toEqual([
      { label: "reset-aave-allowance", hash: resetHash, blockNumber: 100n, status: "success" },
      { label: "approve-aave-exact", hash: approveHash, blockNumber: 101n, status: "success" },
      { label: "aave-v3-supply", hash: supplyHash, blockNumber: 102n, status: "success" },
    ]);
    expect(result.transactions[0].stateCheck).toMatchObject({
      kind: "allowance", beforeAtomic: 1n, afterAtomic: 0n, expectedAtomic: 0n,
    });
    expect(result.transactions[1].stateCheck).toMatchObject({
      kind: "allowance", beforeAtomic: 0n, afterAtomic: INPUT_ATOMIC,
      expectedAtomic: INPUT_ATOMIC,
    });
    expect(result.transactions[2].stateCheck).toMatchObject({
      kind: "aave-supply", inputSpentAtomic: INPUT_ATOMIC,
      scaledATokenDeltaAtomic: INPUT_ATOMIC, suppliedAtomic: INPUT_ATOMIC,
    });
    expect(result.transactions.every(({ gasEstimate }) => gasEstimate === 21_000n)).toBe(true);
    expect(waits).toBe(1);
    expectEstimateThenAuthorityBeforeEverySend(events);
  });

  it("observes swap output before constructing the capped post-swap Aave stage", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hashes = [11, 12, 13, 14, 15].map(transactionHash);
    wallet.hashes.push(...hashes);
    read.latestBlocks.push(
      200n, 200n, 202n, 201n, 203n, 202n, 204n, 203n, 205n, 204n, 206n,
    );
    read.allowance(usdt0, router, 200n, 0n);
    read.allowance(usdt0, router, 201n, INPUT_ATOMIC);
    read.balance(usdt0, 201n, 100_000_000n);
    read.balance(usdg, 201n, 10_000_000n);
    read.balance(usdt0, 202n, 50_000_000n);
    read.balance(usdg, 202n, 60_000_000n);
    read.allowance(usdg, pool, 202n, 1n);
    read.allowance(usdg, pool, 203n, 0n);
    read.allowance(usdg, pool, 204n, OUTPUT_ATOMIC);
    read.balance(usdg, 204n, 60_000_000n);
    read.balance(aUsdg, 204n, 0n);
    read.balance(usdg, 205n, 60_000_000n - OUTPUT_ATOMIC);
    read.balance(aUsdg, 205n, OUTPUT_ATOMIC);
    hashes.forEach((hash, index) => read.receipts(hash, successfulReceipt(201n + BigInt(index))));

    const result = await executeRoutePlanV2(await engineInput(swapPlan, wallet, read));

    expect(result.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact",
      "uniswap-v3-exact-input",
      "reset-aave-allowance",
      "approve-aave-exact",
      "aave-v3-supply",
    ]);
    expect(result.transactions[1].stateCheck).toMatchObject({
      kind: "swap", inputSpentAtomic: INPUT_ATOMIC,
      outputDeltaAtomic: OUTPUT_ATOMIC,
      ownerOutputBalanceDeltaAtomic: 50_000_000n,
      minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC,
    });
    expect(result.transactions[4].stateCheck).toMatchObject({
      kind: "aave-supply", suppliedAtomic: OUTPUT_ATOMIC,
      inputSpentAtomic: OUTPUT_ATOMIC, scaledATokenDeltaAtomic: OUTPUT_ATOMIC,
    });
    const outputReceiptRead = events.indexOf(`read:balanceOf:${usdg.toLowerCase()}:202`);
    const aaveAllowanceRead = events.indexOf(`read:allowance:${usdg.toLowerCase()}:202`);
    expect(outputReceiptRead).toBeGreaterThan(-1);
    expect(aaveAllowanceRead).toBeGreaterThan(outputReceiptRead);
    expectEstimateThenAuthorityBeforeEverySend(events);
  });

  it("executes a one-sided balance swap and attributed full-range LP mint", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hashes = [31, 32, 33, 34, 35].map(transactionHash);
    wallet.hashes.push(...hashes);
    read.latestBlocks.push(
      300n, 300n, 302n, 301n, 303n, 302n, 304n, 303n, 305n, 304n, 306n,
    );
    const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
    read.allowance(usdt0, router, 300n, 0n);
    read.allowance(usdt0, router, 301n, 25_000_000n);
    read.balance(usdt0, 301n, 100_000_000n);
    read.balance(usdg, 301n, 10_000_000n);
    read.balance(usdt0, 302n, 75_000_000n);
    read.balance(usdg, 302n, 34_950_000n);
    read.swapOutputOverrides.set(hashes[1]!, 24_950_000n);
    read.allowance(usdg, manager, 302n, 0n);
    read.allowance(usdt0, manager, 302n, 0n);
    read.allowance(usdg, manager, 303n, 24_950_000n);
    read.allowance(usdt0, manager, 303n, 0n);
    read.allowance(usdt0, manager, 304n, 25_000_000n);
    read.position(305n, {
      token0: usdg,
      token1: usdt0,
      liquidity: 24_700_500n,
    });
    hashes.forEach((hash, index) => read.receipts(
      hash,
      successfulReceipt(301n + BigInt(index)),
    ));

    const result = await executeRoutePlanV2(await engineInput(lpPlan, wallet, read));

    expect(result.status).toBe("success");
    expect(result.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact",
      "uniswap-v3-exact-input",
      "approve-position-manager-exact",
      "approve-position-manager-exact",
      "uniswap-v3-full-range-mint",
    ]);
    expect(result.transactions.at(-1)?.stateCheck).toEqual({
      kind: "uniswap-lp-mint",
      tokenId: 42n,
      token0: usdg,
      token1: usdt0,
      liquidity: 24_700_500n,
      amount0Atomic: 24_950_000n,
      amount1Atomic: 25_000_000n,
    });
    expectEstimateThenAuthorityBeforeEverySend(events);
  });
});
