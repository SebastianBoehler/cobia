import { describe, expect, it } from "vitest";
import { createRouteExecutionMachineV2 } from "./execute-batch";
import {
  aUsdg,
  pool,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  OUTPUT_ATOMIC,
  OWNER,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function machine(
  read: ScriptedReadClient,
  wallet: ScriptedWallet,
  routePlan: unknown = swapPlan,
) {
  wallet.connectReadClient(read);
  return createRouteExecutionMachineV2({
    ...await verifiedExecutionInput(routePlan),
    owner: OWNER,
    wallet,
    readClient: read,
    nowSec: () => NOW_SEC,
    waitForReceiptPoll: async () => {},
  });
}

describe("staged execution capability", () => {
  it("rejects post-swap execution without a machine-confirmed swap", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    wallet.hashes.push(transactionHash(92));
    read.latestBlocks.push(90n);
    read.balance(usdg, 90n, 100_000_000n);
    read.scaledBalance(aUsdg, 90n, 0n);
    const execution = await machine(read, wallet);
    const postSwap = execution.executePostSwap as unknown as (
      capability: unknown,
      allowance: bigint,
    ) => ReturnType<typeof execution.executePostSwap>;

    expect(() => postSwap(MINIMUM_OUTPUT_ATOMIC, MINIMUM_OUTPUT_ATOMIC)).toThrow(
      "confirmed swap capability",
    );
    expect(wallet.sendCount).toBe(0);
  });

  it("rejects a confirmed swap capability in a different verified bundle", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const swapHash = transactionHash(105);
    wallet.hashes.push(swapHash);
    read.latestBlocks.push(200n, 202n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.receipts(swapHash, successfulReceipt(201n));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const sourceMachine = await machine(read, wallet);
    const initial = await sourceMachine.executeInitial(INPUT_ATOMIC);
    if (initial.kind !== "complete") throw new Error("Expected a confirmed swap");
    const alternatePlan = {
      ...swapPlan,
      legs: [{ ...swapPlan.legs[0], id: "alternate-swap-then-supply" }],
    };
    const otherMachine = await machine(read, wallet, alternatePlan);

    expect(() => otherMachine.executePostSwap(
      initial.confirmed.at(-1)!,
      MINIMUM_OUTPUT_ATOMIC,
    )).toThrow("does not belong to this verified route");
    expect(wallet.sendCount).toBe(1);
  });

  it("consumes a confirmed swap capability once", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, supplyHash] = [93, 94].map(transactionHash);
    wallet.hashes.push(swapHash, supplyHash);
    read.latestBlocks.push(200n, 202n, 202n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.balance(usdg, 202n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 202n, 0n);
    read.receipts(swapHash, successfulReceipt(201n));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const execution = await machine(read, wallet);

    const initial = await execution.executeInitial(INPUT_ATOMIC);
    expect(initial.kind).toBe("complete");
    const swap = initial.confirmed.at(-1)!;
    expect(Object.isFrozen(swap)).toBe(true);
    expect(Object.isFrozen(swap.protocolEvidence)).toBe(true);
    expect(Object.isFrozen(swap.stateCheck)).toBe(true);
    expect(Reflect.set(swap.stateCheck, "outputDeltaAtomic", OUTPUT_ATOMIC)).toBe(false);
    const postSwap = await execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC);
    expect(postSwap).toMatchObject({ kind: "pending", submitted: { hash: supplyHash } });
    expect(() => execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC)).toThrow(
      "already consumed",
    );
    expect(wallet.sendCount).toBe(2);
  });

  it("releases a confirmed swap capability when post-swap preflight submits no hash", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, supplyHash] = [97, 98].map(transactionHash);
    wallet.hashes.push(swapHash, supplyHash);
    read.latestBlocks.push(200n, 202n, 202n, 203n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    for (const block of [202n, 203n]) {
      read.balance(usdg, block, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
      read.scaledBalance(aUsdg, block, 0n);
    }
    read.receipts(swapHash, successfulReceipt(201n));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const execution = await machine(read, wallet);
    const initial = await execution.executeInitial(INPUT_ATOMIC);
    if (initial.kind !== "complete") throw new Error("Expected a confirmed swap");
    const swap = initial.confirmed.at(-1)!;

    wallet.rejectEstimateAt = 1;
    await expect(execution.executePostSwap(
      swap,
      MINIMUM_OUTPUT_ATOMIC,
    )).rejects.toThrow("estimate rejected");
    expect(wallet.sendCount).toBe(1);

    wallet.rejectEstimateAt = -1;
    const retried = await execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC);
    expect(retried).toMatchObject({ kind: "pending", submitted: { hash: supplyHash } });
    expect(() => execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC)).toThrow(
      "already consumed",
    );
    expect(wallet.sendCount).toBe(2);
  });

  it("keeps an intermediate approval in flight and releases the swap after confirmation", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, approvalHash, supplyHash] = [102, 103, 104].map(transactionHash);
    wallet.hashes.push(swapHash, approvalHash);
    read.latestBlocks.push(200n, 202n, 202n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.allowance(usdg, pool, 202n, 0n);
    read.receipts(swapHash, successfulReceipt(201n));
    read.receipts(approvalHash, ...Array(12).fill(undefined));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const execution = await machine(read, wallet);
    const initial = await execution.executeInitial(INPUT_ATOMIC);
    if (initial.kind !== "complete") throw new Error("Expected a confirmed swap");
    const swap = initial.confirmed.at(-1)!;

    const approval = await execution.executePostSwap(swap, 0n);
    if (approval.kind !== "pending") throw new Error("Expected a pending approval");
    expect(() => execution.executePostSwap(swap, 0n)).toThrow("already in flight");

    read.receipts(approvalHash, successfulReceipt(203n));
    read.latestBlocks.push(204n, 204n);
    read.allowance(usdg, pool, 203n, MINIMUM_OUTPUT_ATOMIC);
    const resumed = await execution.resumeSubmitted(approval.resume);
    expect(resumed).toMatchObject({ status: "confirmed", transaction: { hash: approvalHash } });

    wallet.hashes.push(supplyHash);
    read.balance(usdg, 204n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 204n, 0n);
    const postSwap = await execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC);
    expect(postSwap).toMatchObject({ kind: "pending", submitted: { hash: supplyHash } });
    expect(() => execution.executePostSwap(swap, MINIMUM_OUTPUT_ATOMIC)).toThrow(
      "already consumed",
    );
  });

  it("keeps an approval checkpoint resumable after a post-broadcast chain failure", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, approvalHash, supplyHash] = [106, 107, 108].map(transactionHash);
    wallet.hashes.push(swapHash, approvalHash);
    read.latestBlocks.push(200n, 202n, 202n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.allowance(usdg, pool, 202n, 0n);
    read.receipts(swapHash, successfulReceipt(201n));
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const request = wallet.request.bind(wallet);
    wallet.request = async (walletRequest) => {
      const result = await request(walletRequest);
      if (walletRequest.method === "eth_sendTransaction" && wallet.sendCount === 2) {
        read.chainId = 1;
      }
      return result;
    };
    const execution = await machine(read, wallet);
    const initial = await execution.executeInitial(INPUT_ATOMIC);
    if (initial.kind !== "complete") throw new Error("Expected a confirmed swap");
    const swap = initial.confirmed.at(-1)!;

    const interrupted = await execution.executePostSwap(swap, 0n);
    if (interrupted.kind !== "failed" || !interrupted.resume) {
      throw new Error("Expected a submitted approval failure");
    }
    expect(interrupted).toMatchObject({ submitted: { hash: approvalHash } });
    expect(() => execution.executePostSwap(swap, 0n)).toThrow("already in flight");

    read.chainId = 196;
    read.receipts(approvalHash, successfulReceipt(203n));
    read.latestBlocks.push(204n, 204n);
    read.allowance(usdg, pool, 203n, MINIMUM_OUTPUT_ATOMIC);
    await expect(execution.resumeSubmitted(interrupted.resume)).resolves.toMatchObject({
      status: "confirmed",
      transaction: { hash: approvalHash },
    });

    wallet.hashes.push(supplyHash);
    read.balance(usdg, 204n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 204n, 0n);
    await expect(execution.executePostSwap(
      swap,
      MINIMUM_OUTPUT_ATOMIC,
    )).resolves.toMatchObject({ kind: "pending", submitted: { hash: supplyHash } });
  });

  it("does not remint a consumed capability by resuming in a new machine", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, supplyHash] = [95, 96].map(transactionHash);
    wallet.hashes.push(swapHash);
    read.latestBlocks.push(200n);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.receipts(swapHash, ...Array(12).fill(undefined));
    const submittingMachine = await machine(read, wallet);
    const pending = await submittingMachine.executeInitial(INPUT_ATOMIC);
    if (pending.kind !== "pending") throw new Error("Expected a pending swap");

    read.receipts(swapHash, successfulReceipt(201n));
    read.latestBlocks.push(202n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const firstResumeMachine = await machine(read, wallet);
    const firstResume = await firstResumeMachine.resumeSubmitted(pending.resume);
    if (firstResume.status !== "confirmed") throw new Error("Expected a confirmed swap");

    wallet.hashes.push(supplyHash);
    read.latestBlocks.push(202n);
    read.balance(usdg, 202n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 202n, 0n);
    await firstResumeMachine.executePostSwap(firstResume.transaction, MINIMUM_OUTPUT_ATOMIC);

    read.latestBlocks.push(202n);
    const secondResumeMachine = await machine(read, wallet);
    const secondResume = await secondResumeMachine.resumeSubmitted(pending.resume);
    if (secondResume.status !== "confirmed") throw new Error("Expected a confirmed swap");

    expect(() => secondResumeMachine.executePostSwap(
      secondResume.transaction,
      MINIMUM_OUTPUT_ATOMIC,
    )).toThrow("already consumed");
    expect(wallet.sendCount).toBe(2);
  });
});
