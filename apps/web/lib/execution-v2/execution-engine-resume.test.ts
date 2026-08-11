import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { ERC20_APPROVE_ABI } from "./abis";
import {
  createRouteExecutionMachineV2,
} from "./execute-batch";
import {
  executeRoutePlanV2,
  resumeSubmittedRouteTransactionV2,
} from "./execute-route";
import {
  aUsdg,
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
  NOW_SEC,
  OWNER,
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

async function pendingExecution(byte: number) {
  const read = new ScriptedReadClient([]);
  const wallet = new ScriptedWallet([]);
  const hash = transactionHash(byte);
  wallet.hashes.push(hash);
  read.latestBlocks.push(90n, 90n);
  read.allowance(usdt0, pool, 90n, 1n);
  read.receipts(hash, ...Array(12).fill(undefined));
  const executionInput = await input(wallet, read);
  const result = await executeRoutePlanV2(executionInput);
  if (result.status !== "pending") throw new Error("Expected a pending transaction");
  return { executionInput, hash, read, result, wallet };
}

describe("execution resume authority", () => {
  it("deep-freezes every issued checkpoint component", async () => {
    const { result } = await pendingExecution(85);

    expect(Object.isFrozen(result.resume)).toBe(true);
    expect(Object.isFrozen(result.resume.transaction)).toBe(true);
    expect(Object.isFrozen(result.resume.submitted)).toBe(true);
    expect(Object.isFrozen(result.resume.capturedState)).toBe(true);
  });

  it("rejects an exact structural clone without issued checkpoint provenance", async () => {
    const { executionInput, result, wallet } = await pendingExecution(86);
    const clone = {
      ...result.resume,
      transaction: { ...result.resume.transaction },
      submitted: { ...result.resume.submitted },
      capturedState: { ...result.resume.capturedState },
    };

    await expect(resumeSubmittedRouteTransactionV2({
      ...executionInput,
      checkpoint: clone,
    })).rejects.toThrow("authorized step");
    expect(wallet.sendCount).toBe(1);
  });

  it("returns a hash-addressable checkpoint and resumes the exact transaction", async () => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(71);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.receipts(hash, ...Array(12).fill(undefined));

    const executionInput = await input(wallet, read);
    const pending = await executeRoutePlanV2(executionInput);
    expect(pending).toMatchObject({
      status: "pending",
      transactions: [],
      submitted: { hash, label: "reset-aave-allowance" },
      resume: { kind: "submitted-hash", bundleHash: executionInput.verdict.bundleHash },
    });
    if (pending.status !== "pending") throw new Error("Expected a pending transaction");

    read.receipts(hash, successfulReceipt(100n));
    read.latestBlocks.push(101n);
    read.allowance(usdt0, pool, 100n, 0n);
    const resumed = await resumeSubmittedRouteTransactionV2({
      ...executionInput,
      checkpoint: pending.resume,
    });
    expect(resumed).toMatchObject({
      status: "confirmed",
      transaction: { hash, blockNumber: 100n, blockHash: expect.any(String) },
    });
    expect(wallet.sendCount).toBe(1);
  });

  it("rejects resume reads from a different chain before polling the transaction", async () => {
    const { executionInput, read, result } = await pendingExecution(99);
    read.chainId = 1952;

    await expect(resumeSubmittedRouteTransactionV2({
      ...executionInput,
      checkpoint: result.resume,
    })).resolves.toMatchObject({
      status: "failed",
      submitted: { hash: result.submitted.hash },
      failure: { code: "receipt-attribution", message: expect.stringContaining("chain 196") },
    });
  });

  it("preserves a resumed swap capability across the route-wrapper machine boundary", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const [swapHash, supplyHash] = [100, 101].map(transactionHash);
    wallet.hashes.push(swapHash);
    read.latestBlocks.push(199n, 200n);
    read.allowance(usdt0, router, 199n, INPUT_ATOMIC);
    read.balance(usdt0, 200n, 100_000_000n);
    read.balance(usdg, 200n, 10_000_000n);
    read.receipts(swapHash, ...Array(12).fill(undefined));
    wallet.connectReadClient(read);
    const executionInput = {
      ...await verifiedExecutionInput(swapPlan),
      wallet,
      readClient: read,
      nowSec: () => NOW_SEC,
      waitForReceiptPoll: async () => {},
    };
    const pending = await executeRoutePlanV2(executionInput);
    if (pending.status !== "pending") throw new Error("Expected a pending swap");

    read.receipts(swapHash, successfulReceipt(201n));
    read.latestBlocks.push(202n, 202n);
    read.balance(usdt0, 201n, 100_000_000n - INPUT_ATOMIC);
    read.balance(usdg, 201n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.swapOutputOverrides.set(swapHash, MINIMUM_OUTPUT_ATOMIC);
    const resumed = await resumeSubmittedRouteTransactionV2({
      ...executionInput,
      checkpoint: pending.resume,
    });
    if (resumed.status !== "confirmed") throw new Error("Expected a confirmed swap");

    wallet.hashes.push(supplyHash);
    read.balance(usdg, 202n, 10_000_000n + MINIMUM_OUTPUT_ATOMIC);
    read.scaledBalance(aUsdg, 202n, 0n);
    const continuation = createRouteExecutionMachineV2({
      ...executionInput,
      owner: OWNER,
    });
    const postSwap = await continuation.executePostSwap(
      resumed.transaction,
      MINIMUM_OUTPUT_ATOMIC,
    );
    expect(postSwap).toMatchObject({ kind: "pending", submitted: { hash: supplyHash } });
    expect(wallet.sendCount).toBe(2);
  });

  it.each([
    ["phase", (checkpoint: Record<string, unknown>) => ({
      ...checkpoint,
      phase: "post-swap",
    })],
    ["authorized amount", (checkpoint: Record<string, unknown>) => ({
      ...checkpoint,
      authorizedAmountAtomic: INPUT_ATOMIC + 1n,
    })],
    ["target and calldata", (checkpoint: Record<string, unknown>) => ({
      ...checkpoint,
      transaction: {
        ...(checkpoint.transaction as Record<string, unknown>),
        to: usdg,
        data: encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [pool, 123n],
        }),
      },
    })],
  ] as const)("rejects a checkpoint with substituted %s", async (_, mutate) => {
    const events: string[] = [];
    const read = new ScriptedReadClient(events);
    const wallet = new ScriptedWallet(events);
    const hash = transactionHash(77);
    wallet.hashes.push(hash);
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, 1n);
    read.receipts(hash, ...Array(12).fill(undefined));
    const executionInput = await input(wallet, read);
    const pending = await executeRoutePlanV2(executionInput);
    if (pending.status !== "pending") throw new Error("Expected a pending transaction");

    await expect(resumeSubmittedRouteTransactionV2({
      ...executionInput,
      checkpoint: mutate(pending.resume as unknown as Record<string, unknown>) as never,
    })).rejects.toThrow("authorized step");
    expect(wallet.sendCount).toBe(1);
  });
});
