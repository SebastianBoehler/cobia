import { describe, expect, it } from "vitest";
import { executeRoutePlanV2 } from "./execute-route";
import {
  aUsdt0,
  pool,
  revertedReceipt,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  DEADLINE_SEC,
  directPlan,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function input(
  wallet: ScriptedWallet,
  readClient: ScriptedReadClient,
  routePlan: unknown = directPlan,
) {
  wallet.connectReadClient(readClient);
  const verified = await verifiedExecutionInput(routePlan);
  return {
    ...verified,
    nowSec: () => NOW_SEC,
    wallet,
    readClient,
    waitForReceiptPoll: async () => {},
  };
}

function firstApprovalScenario() {
  const events: string[] = [];
  const read = new ScriptedReadClient(events);
  const wallet = new ScriptedWallet(events);
  const hash = transactionHash(31);
  wallet.hashes.push(hash);
  read.latestBlocks.push(90n, 90n);
  read.allowance(usdt0, pool, 90n, 1n);
  return { events, read, wallet, hash };
}

describe("executeRoutePlanV2 failure boundaries", () => {
  it.each([
    ["wallet chain", (wallet: ScriptedWallet) => {
      wallet.chainId = "0x1";
    }],
    ["read chain", (_wallet: ScriptedWallet, read: ScriptedReadClient) => {
      read.chainId = 1;
    }],
    ["owner account", (wallet: ScriptedWallet) => {
      wallet.accounts = ["0x2222222222222222222222222222222222222222"];
    }],
  ] as const)("rejects a mismatched %s before estimation", async (_, mutate) => {
    const scenario = firstApprovalScenario();
    mutate(scenario.wallet, scenario.read);
    await expect(executeRoutePlanV2(await input(scenario.wallet, scenario.read))).rejects.toThrow();
    expect(scenario.wallet.estimateCount).toBe(0);
    expect(scenario.wallet.sendCount).toBe(0);
  });

  it("does not send when immediate gas estimation rejects", async () => {
    const scenario = firstApprovalScenario();
    scenario.wallet.rejectEstimateAt = 0;
    await expect(executeRoutePlanV2(await input(scenario.wallet, scenario.read))).rejects.toThrow(
      "estimate rejected",
    );
    expect(scenario.wallet.sendCount).toBe(0);
  });

  it("does not send the next transaction after wallet rejection", async () => {
    const scenario = firstApprovalScenario();
    scenario.wallet.rejectSendAt = 0;
    await expect(executeRoutePlanV2(await input(scenario.wallet, scenario.read))).rejects.toThrow(
      "wallet rejected",
    );
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it("does not send the next transaction after a reverted receipt", async () => {
    const scenario = firstApprovalScenario();
    scenario.read.latestBlocks.push(101n);
    scenario.read.receipts(scenario.hash, revertedReceipt(100n));
    const result = await executeRoutePlanV2(await input(scenario.wallet, scenario.read));
    expect(result).toMatchObject({
      status: "failed",
      submitted: { hash: scenario.hash },
      failure: { code: "transaction-reverted" },
    });
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it("rechecks wallet authority and stops after a chain switch between steps", async () => {
    const scenario = firstApprovalScenario();
    scenario.wallet.chainIds.push("0xc4", "0xc4", "0xc4", "0x1");
    scenario.read.latestBlocks.push(101n);
    scenario.read.allowance(usdt0, pool, 100n, 0n);
    scenario.read.receipts(scenario.hash, successfulReceipt(100n));

    const result = await executeRoutePlanV2(await input(scenario.wallet, scenario.read));
    expect(result).toMatchObject({
      status: "partial",
      transactions: [{ hash: scenario.hash }],
      failure: { code: "step-preflight", message: expect.stringContaining("chain 196") },
    });
    expect(scenario.wallet.sendCount).toBe(1);
    expect(scenario.wallet.estimateCount).toBe(1);
  });

  it("rechecks wallet authority after estimation before sending", async () => {
    const scenario = firstApprovalScenario();
    const request = scenario.wallet.request.bind(scenario.wallet);
    scenario.wallet.request = async (walletRequest) => {
      const result = await request(walletRequest);
      if (walletRequest.method === "eth_estimateGas") scenario.wallet.chainId = "0x1";
      return result;
    };

    await expect(executeRoutePlanV2(await input(scenario.wallet, scenario.read))).rejects.toThrow(
      "chain 196",
    );
    expect(scenario.wallet.estimateCount).toBe(1);
    expect(scenario.wallet.sendCount).toBe(0);
  });

  it("preserves the submitted hash when the read chain changes after broadcast", async () => {
    const scenario = firstApprovalScenario();
    const request = scenario.wallet.request.bind(scenario.wallet);
    scenario.wallet.request = async (walletRequest) => {
      const result = await request(walletRequest);
      if (walletRequest.method === "eth_sendTransaction") scenario.read.chainId = 1;
      return result;
    };

    const result = await executeRoutePlanV2(await input(scenario.wallet, scenario.read));

    expect(result).toMatchObject({
      status: "failed",
      submitted: { hash: scenario.hash },
      resume: { kind: "submitted-hash" },
      failure: { code: "receipt-attribution", message: expect.stringContaining("chain 196") },
    });
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it("bounds receipt polling and does not send the next transaction", async () => {
    const scenario = firstApprovalScenario();
    scenario.read.receipts(scenario.hash, ...Array(12).fill(undefined));
    let waits = 0;
    const result = await executeRoutePlanV2({
      ...await input(scenario.wallet, scenario.read),
      waitForReceiptPoll: async () => { waits += 1; },
    });
    expect(result).toMatchObject({
      status: "pending",
      submitted: { hash: scenario.hash },
      resume: { kind: "submitted-hash" },
    });
    expect(scenario.events.filter((event) => event.startsWith("read:receipt:"))).toHaveLength(12);
    expect(waits).toBe(11);
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it("stops after an approval receipt whose exact allowance is wrong", async () => {
    const scenario = firstApprovalScenario();
    scenario.read.latestBlocks.push(101n);
    scenario.read.receipts(scenario.hash, successfulReceipt(100n));
    scenario.read.allowance(usdt0, pool, 100n, 2n);
    const result = await executeRoutePlanV2(await input(scenario.wallet, scenario.read));
    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "state-postcondition", message: expect.stringContaining("exact allowance") },
    });
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it.each([
    ["wrong input spend", 50_000_001n, 60_000_000n],
    ["output below event", 50_000_000n, 58_999_999n],
  ] as const)("stops staged execution on %s", async (_, inputAfter, outputAfter) => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const [approveHash, swapHash] = [41, 42].map(transactionHash);
    wallet.hashes.push(approveHash, swapHash);
    read.latestBlocks.push(200n, 200n, 202n, 201n, 203n);
    read.allowance(usdt0, pool, 200n, 0n);
    read.allowance(usdt0, pool, 201n, INPUT_ATOMIC);
    // Swap allowance is to the router; route execution must not accidentally use the pool entry.
    const router = "0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA";
    read.allowance(usdt0, router, 200n, 0n);
    read.allowance(usdt0, router, 201n, INPUT_ATOMIC);
    read.balance(usdt0, 201n, 100_000_000n);
    read.balance(usdg, 201n, 10_000_000n);
    read.balance(usdt0, 202n, inputAfter);
    read.balance(usdg, 202n, outputAfter);
    read.receipts(approveHash, successfulReceipt(201n));
    read.receipts(swapHash, successfulReceipt(202n));

    const result = await executeRoutePlanV2(await input(wallet, read, swapPlan));
    expect(result).toMatchObject({
      status: "partial",
      transactions: [{ hash: approveHash }],
      submitted: { hash: swapHash },
      failure: { code: "state-postcondition" },
    });
    expect(wallet.sendCount).toBe(2);
  });

  it("rejects an Aave receipt with no scaled aToken balance increase", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const supplyHash = transactionHash(51);
    wallet.hashes.push(supplyHash);
    read.latestBlocks.push(90n, 90n, 101n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, 0n);
    read.receipts(supplyHash, successfulReceipt(100n));
    const result = await executeRoutePlanV2(await input(wallet, read));
    expect(result).toMatchObject({
      status: "failed",
      failure: {
        code: "state-postcondition",
        message: expect.stringContaining("scaled aToken balance"),
      },
    });
    expect(wallet.sendCount).toBe(1);
  });

  it("rechecks signed freshness and stops when expiry advances between steps", async () => {
    const scenario = firstApprovalScenario();
    scenario.wallet.connectReadClient(scenario.read);
    scenario.read.latestBlocks.push(101n, 100n);
    scenario.read.allowance(usdt0, pool, 100n, 0n);
    scenario.read.receipts(scenario.hash, successfulReceipt(100n));
    const verified = await verifiedExecutionInput();
    const times = [NOW_SEC, NOW_SEC, NOW_SEC, DEADLINE_SEC];
    const result = await executeRoutePlanV2({
      ...verified,
      wallet: scenario.wallet,
      readClient: scenario.read,
      nowSec: () => times.shift() ?? DEADLINE_SEC,
      waitForReceiptPoll: async () => {},
    });
    expect(result).toMatchObject({
      status: "partial",
      failure: { code: "step-preflight", message: expect.stringContaining("expired") },
    });
    expect(scenario.wallet.estimateCount).toBe(2);
    expect(scenario.wallet.sendCount).toBe(1);
  });

  it.each(["allowance-read", "estimate"] as const)(
    "preserves the confirmed swap when post-swap %s fails before another hash",
    async (failure) => {
      const events: string[] = [];
      const read = new ScriptedReadClient(events);
      const wallet = new ScriptedWallet(events);
      const swapHash = transactionHash(61);
      wallet.hashes.push(swapHash);
      read.latestBlocks.push(200n, 200n, 202n);
      read.allowance(usdt0, "0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA", 200n, INPUT_ATOMIC);
      read.balance(usdt0, 200n, 100_000_000n);
      read.balance(usdg, 200n, 10_000_000n);
      read.balance(usdt0, 201n, 50_000_000n);
      read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
      read.receipts(swapHash, successfulReceipt(201n));
      read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
      if (failure === "estimate") {
        read.allowance(usdg, pool, 201n, 0n);
        read.latestBlocks.push(203n);
        read.allowance(usdg, pool, 203n, 0n);
        wallet.rejectEstimateAt = 1;
      }

      const result = await executeRoutePlanV2(await input(wallet, read, swapPlan));

      expect(result).toMatchObject({
        status: "partial",
        transactions: [{ hash: swapHash }],
        failure: { code: "step-preflight" },
      });
      expect(wallet.sendCount).toBe(1);
    },
  );
});
