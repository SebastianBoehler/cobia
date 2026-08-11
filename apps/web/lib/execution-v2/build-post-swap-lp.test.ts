import { describe, expect, it } from "vitest";
import { buildPostSwapLiquidityTransactionsV2 } from "./build-post-swap-lp";
import {
  lpPlan,
  NOW_SEC,
  verifiedExecutionInput,
} from "./test-fixtures";

async function build(observed: bigint, token0Allowance = 0n, token1Allowance = 0n) {
  const verified = await verifiedExecutionInput(lpPlan);
  return buildPostSwapLiquidityTransactionsV2({
    ...verified,
    nowSec: NOW_SEC,
    observedOutputBalanceDeltaAtomic: observed,
    currentToken0AllowanceAtomic: token0Allowance,
    currentToken1AllowanceAtomic: token1Allowance,
  });
}

describe("buildPostSwapLiquidityTransactionsV2", () => {
  it("approves both exact desired amounts and emits one bounded owner LP mint", async () => {
    const result = await build(24_950_000n);
    expect(result.transactions.map(({ label }) => label)).toEqual([
      "approve-position-manager-exact",
      "approve-position-manager-exact",
      "uniswap-v3-full-range-mint",
    ]);
    expect(result.postconditions).toEqual([{
      kind: "uniswap-v3-full-range-mint",
      owner: "0x1111111111111111111111111111111111111111",
      token0: lpPlan.legs[0].actions[1].token0.toLowerCase(),
      token1: lpPlan.legs[0].actions[1].token1.toLowerCase(),
      amount0DesiredAtomic: 24_950_000n,
      amount1DesiredAtomic: 25_000_000n,
      amount0MinAtomic: 24_700_500n,
      amount1MinAtomic: 24_750_000n,
      minimumLiquidity: 24_700_500n,
    }]);
  });

  it("caps favorable swap output at the signed quote", async () => {
    const result = await build(30_000_000n, 24_950_000n, 25_000_000n);
    expect(result.transactions).toHaveLength(1);
    expect(result.postconditions[0]).toMatchObject({ amount0DesiredAtomic: 24_950_000n });
  });

  it("uses an observed output within the signed floor without sweeping other funds", async () => {
    const result = await build(24_800_000n, 24_800_000n, 25_000_000n);
    expect(result.transactions).toHaveLength(1);
    expect(result.postconditions[0]).toMatchObject({
      amount0DesiredAtomic: 24_800_000n,
      amount0MinAtomic: 24_700_500n,
    });
  });

  it("rejects an observed output below the signed minimum", async () => {
    await expect(build(24_700_499n)).rejects.toThrow("below the signed minimum");
  });
});
