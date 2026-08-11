import { decodeFunctionData, isAddressEqual } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { AAVE_POOL_SUPPLY_ABI, ERC20_APPROVE_ABI } from "./abis";
import { buildPostSwapSupplyTransactionsV2 } from "./build-post-swap";
import {
  DEADLINE_SEC,
  directPlan,
  MINIMUM_OUTPUT_ATOMIC,
  noActionPlan,
  NOW_SEC,
  OWNER,
  OUTPUT_ATOMIC,
  swapPlan,
  usdg,
  verifiedExecutionInput,
} from "./test-fixtures";

const OBSERVED_OUTPUT_ATOMIC = 49_950_000n;

async function postSwap(
  observedOutputBalanceDeltaAtomic: bigint,
  currentAllowanceAtomic: bigint,
  routePlan: unknown = swapPlan,
) {
  const verified = await verifiedExecutionInput(routePlan);
  return buildPostSwapSupplyTransactionsV2({
    ...verified,
    nowSec: NOW_SEC,
    observedOutputBalanceDeltaAtomic,
    currentAllowanceAtomic,
  });
}

describe("buildPostSwapSupplyTransactionsV2", () => {
  it("caps approval and supply at the signed quote, preserving observed excess", async () => {
    const result = await postSwap(OBSERVED_OUTPUT_ATOMIC, 1n);
    expect(result.transactions.map(({ label }) => label)).toEqual([
      "reset-aave-allowance",
      "approve-aave-exact",
      "aave-v3-supply",
    ]);
    const [reset, approve, supply] = result.transactions;
    const pool = PROTOCOL_REGISTRY.aaveV3.pool.address;
    for (const transaction of result.transactions) {
      expect(transaction.chainId).toBe(196);
      expect(isAddressEqual(transaction.from, OWNER)).toBe(true);
      expect(transaction.value).toBe(0n);
    }
    expect(isAddressEqual(reset.to, usdg)).toBe(true);
    expect(reset.data.slice(0, 10)).toBe("0x095ea7b3");
    expect(decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: reset.data }).args)
      .toEqual([pool, 0n]);
    expect(isAddressEqual(approve.to, usdg)).toBe(true);
    expect(approve.data.slice(0, 10)).toBe("0x095ea7b3");
    expect(decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: approve.data }).args)
      .toEqual([pool, OUTPUT_ATOMIC]);
    expect(isAddressEqual(supply.to, pool)).toBe(true);
    expect(supply.data.slice(0, 10)).toBe("0x617ba037");
    expect(decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: supply.data }).args)
      .toEqual([usdg, OUTPUT_ATOMIC, OWNER, 0]);
    expect(result.postconditions).toEqual([{
      kind: "aave-v3-supply",
      owner: OWNER,
      asset: usdg,
      aToken: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address,
      amountAtomic: OUTPUT_ATOMIC,
    }]);
  });

  it("does not sweep an arbitrarily large observed balance delta", async () => {
    const hugeObserved = OUTPUT_ATOMIC + 10n ** 18n;
    const result = await postSwap(hugeObserved, hugeObserved);
    const supply = result.transactions[0];
    expect(decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: supply.data }).args)
      .toEqual([usdg, OUTPUT_ATOMIC, OWNER, 0]);
  });

  it.each([MINIMUM_OUTPUT_ATOMIC, MINIMUM_OUTPUT_ATOMIC + 1n])(
    "accepts observed output %s at or above the signed minimum",
    async (observed) => {
      const result = await postSwap(observed, observed);
      expect(result.transactions.map(({ label }) => label)).toEqual(["aave-v3-supply"]);
      expect(decodeFunctionData({
        abi: AAVE_POOL_SUPPLY_ABI,
        data: result.transactions[0].data,
      }).args).toEqual([usdg, observed, OWNER, 0]);
    },
  );

  it("rejects observed output below the signed minimum", async () => {
    await expect(postSwap(MINIMUM_OUTPUT_ATOMIC - 1n, 0n)).rejects.toThrow(
      "below the signed minimum",
    );
  });

  it.each([
    ["direct", directPlan],
    ["no-action", noActionPlan],
  ])("rejects a %s plan because no swap output was observed", async (_, routePlan) => {
    await expect(postSwap(OBSERVED_OUTPUT_ATOMIC, 0n, routePlan)).rejects.toThrow(
      "swap-then-supply",
    );
  });

  it("rejects an expired second phase", async () => {
    const verified = await verifiedExecutionInput(swapPlan);
    expect(() => buildPostSwapSupplyTransactionsV2({
      ...verified,
      nowSec: DEADLINE_SEC,
      observedOutputBalanceDeltaAtomic: OBSERVED_OUTPUT_ATOMIC,
      currentAllowanceAtomic: 0n,
    })).toThrow("expired");
  });
});
