import { decodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  ERC20_APPROVE_ABI,
  SWAP_ROUTER02_ABI,
} from "./abis";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import {
  DEADLINE_SEC,
  directPlan,
  executionPolicy,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  noActionPlan,
  NOW_SEC,
  OWNER,
  OUTPUT_ATOMIC,
  swapPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function initial(routePlan: unknown, currentAllowanceAtomic?: bigint) {
  const verified = await verifiedExecutionInput(routePlan);
  return buildInitialRouteTransactionsV2({
    ...verified,
    nowSec: NOW_SEC,
    currentAllowanceAtomic,
  });
}

function expectEnvelope(
  transaction: { chainId: number; from: Address; to: Address; value: bigint },
  target: Address,
) {
  expect(transaction.chainId).toBe(196);
  expect(isAddressEqual(transaction.from, OWNER)).toBe(true);
  expect(isAddressEqual(transaction.to, target)).toBe(true);
  expect(transaction.value).toBe(0n);
}

function decodeApproval(data: Hex) {
  expect(data.slice(0, 10)).toBe("0x095ea7b3");
  const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data });
  expect(decoded.functionName).toBe("approve");
  return decoded.args;
}

describe("buildInitialRouteTransactionsV2 direct Aave phase", () => {
  it.each([
    [INPUT_ATOMIC, ["aave-v3-supply"]],
    [INPUT_ATOMIC + 1n, ["aave-v3-supply"]],
    [0n, ["approve-aave-exact", "aave-v3-supply"]],
    [1n, ["reset-aave-allowance", "approve-aave-exact", "aave-v3-supply"]],
  ] as const)("uses exact approval ordering for allowance %s", async (allowance, labels) => {
    expect((await initial(directPlan, allowance)).transactions.map(({ label }) => label))
      .toEqual(labels);
  });

  it("encodes reset, exact approval, and owner-beneficiary Pool.supply", async () => {
    const result = await initial(directPlan, 1n);
    const [reset, approve, supply] = result.transactions;
    const pool = PROTOCOL_REGISTRY.aaveV3.pool.address;

    expectEnvelope(reset, usdt0);
    expect(decodeApproval(reset.data)).toEqual([pool, 0n]);
    expectEnvelope(approve, usdt0);
    expect(decodeApproval(approve.data)).toEqual([pool, INPUT_ATOMIC]);
    expectEnvelope(supply, pool);
    expect(supply.data.slice(0, 10)).toBe("0x617ba037");
    const decoded = decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: supply.data });
    expect(decoded.functionName).toBe("supply");
    expect(decoded.args).toEqual([usdt0, INPUT_ATOMIC, OWNER, 0]);
    expect(result.postconditions).toEqual([{
      kind: "aave-v3-supply",
      owner: OWNER,
      asset: usdt0,
      aToken: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address,
      amountAtomic: INPUT_ATOMIC,
    }]);
  });

  it("emits no transaction or postcondition for a no-action plan", async () => {
    expect(await initial(noActionPlan)).toEqual({ transactions: [], postconditions: [] });
  });
});

describe("buildInitialRouteTransactionsV2 swap phase", () => {
  it.each([
    [INPUT_ATOMIC, ["uniswap-v3-exact-input"]],
    [0n, ["approve-uniswap-exact", "uniswap-v3-exact-input"]],
    [1n, ["reset-uniswap-allowance", "approve-uniswap-exact", "uniswap-v3-exact-input"]],
  ] as const)("uses exact router approval ordering for allowance %s", async (allowance, labels) => {
    expect((await initial(swapPlan, allowance)).transactions.map(({ label }) => label))
      .toEqual(labels);
  });

  it("encodes a deadline multicall with the complete signed exact-input tuple", async () => {
    const result = await initial(swapPlan, 1n);
    const [reset, approve, swap] = result.transactions;
    const router = PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;

    expectEnvelope(reset, usdt0);
    expect(decodeApproval(reset.data)).toEqual([router, 0n]);
    expectEnvelope(approve, usdt0);
    expect(decodeApproval(approve.data)).toEqual([router, INPUT_ATOMIC]);
    expectEnvelope(swap, router);
    expect(swap.data.slice(0, 10)).toBe("0x5ae401dc");
    const outer = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: swap.data });
    expect(outer.functionName).toBe("multicall");
    if (outer.functionName !== "multicall") throw new Error("Expected router multicall");
    expect(outer.args[0]).toBe(BigInt(DEADLINE_SEC));
    expect(outer.args[1]).toHaveLength(1);
    const innerData = outer.args[1][0]!;
    expect(innerData.slice(0, 10)).toBe("0x04e45aaf");
    const inner = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: innerData });
    expect(inner.functionName).toBe("exactInputSingle");
    expect(inner.args[0]).toEqual({
      tokenIn: usdt0,
      tokenOut: usdg,
      fee: 100,
      recipient: OWNER,
      amountIn: INPUT_ATOMIC,
      amountOutMinimum: MINIMUM_OUTPUT_ATOMIC,
      sqrtPriceLimitX96: 0n,
    });
    expect(result.transactions.some(({ to }) =>
      isAddressEqual(to, PROTOCOL_REGISTRY.aaveV3.pool.address))).toBe(false);
    expect(result.postconditions).toEqual([{
      kind: "owner-output-balance-delta",
      owner: OWNER,
      asset: usdg,
      minimumDeltaAtomic: MINIMUM_OUTPUT_ATOMIC,
      quotedDeltaAtomic: OUTPUT_ATOMIC,
    }]);
  });
});

describe("buildInitialRouteTransactionsV2 validation", () => {
  it("rejects an expired signed bundle", async () => {
    const verified = await verifiedExecutionInput();
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: DEADLINE_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow("expired");
  });

  it("rejects a negative allowance", async () => {
    const verified = await verifiedExecutionInput();
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: -1n,
    })).toThrow("non-negative bigint");
  });

  it("derives the owner from the policy and rejects policy substitution", async () => {
    const verified = await verifiedExecutionInput();
    const policy = {
      ...executionPolicy,
      owner: "0x2222222222222222222222222222222222222222" as const,
    };
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      policy,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow("policy does not belong");
  });

  it("rejects a cloned or fabricated authorization verdict", async () => {
    const verified = await verifiedExecutionInput();
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      verdict: { ...verified.verdict },
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow("not produced by verifyRouteBundleV2");
  });

  it("does not accept the former bare-plan execution shape", () => {
    const barePlan = {
      routePlan: directPlan,
      owner: OWNER,
      deadlineSec: DEADLINE_SEC,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    };
    expect(() => buildInitialRouteTransactionsV2(
      barePlan as unknown as Parameters<typeof buildInitialRouteTransactionsV2>[0],
    )).toThrow("not produced by verifyRouteBundleV2");
  });

  it("rejects a bundle tampered to use an unregistered route asset", async () => {
    const verified = await verifiedExecutionInput();
    const unregistered = "0x2222222222222222222222222222222222222222";
    const routePlan = {
      ...directPlan,
      inputAsset: unregistered,
      legs: [{ ...directPlan.legs[0], actions: [{
        ...directPlan.legs[0].actions[0], asset: unregistered,
      }] }],
    };
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      bundle: { ...verified.bundle, routePlan } as typeof verified.bundle,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow("does not belong");
  });

  it("rejects a bundle tampered to use an unregistered swap output", async () => {
    const verified = await verifiedExecutionInput(swapPlan);
    const unregistered = "0x2222222222222222222222222222222222222222";
    const routePlan = {
      ...swapPlan,
      legs: [{ ...swapPlan.legs[0], actions: [
        { ...swapPlan.legs[0].actions[0], tokenOut: unregistered },
        { ...swapPlan.legs[0].actions[1], asset: unregistered },
      ] }],
    };
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      bundle: { ...verified.bundle, routePlan } as typeof verified.bundle,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow("does not belong");
  });

  it("rejects a strict-shape transaction target injection", async () => {
    const verified = await verifiedExecutionInput();
    const routePlan = {
      ...directPlan,
      legs: [{ ...directPlan.legs[0], actions: [{
        ...directPlan.legs[0].actions[0], target: OWNER,
      }] }],
    };
    expect(() => buildInitialRouteTransactionsV2({
      ...verified,
      bundle: { ...verified.bundle, routePlan } as unknown as typeof verified.bundle,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 0n,
    })).toThrow();
  });
});
