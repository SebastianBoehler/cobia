import { describe, expect, it } from "vitest";
import {
  annualizedFullRangeFeeApyBps,
  fullRangeAmountsForLiquidity,
  fullRangeLiquidityForAmounts,
} from "./uniswap-lp-math";

const Q96 = 2n ** 96n;
const Q128 = 2n ** 128n;

describe("Uniswap V3 full-range LP math", () => {
  it("matches the official full-range liquidity floor at parity", () => {
    const liquidity = fullRangeLiquidityForAmounts({
      sqrtPriceX96: Q96,
      amount0Atomic: 7_500_000n,
      amount1Atomic: 7_490_000n,
    });
    expect(liquidity).toBe(7_490_000n);
    expect(fullRangeAmountsForLiquidity({
      sqrtPriceX96: Q96,
      liquidity,
    })).toEqual({ amount0Atomic: 7_489_999n, amount1Atomic: 7_489_999n });
  });

  it("annualizes only observed fee growth over the explicit lookback", () => {
    expect(annualizedFullRangeFeeApyBps({
      liquidity: 7_490_000n,
      sqrtPriceX96: Q96,
      feeGrowth0DeltaX128: Q128 / 10_000n,
      feeGrowth1DeltaX128: Q128 / 10_000n,
      token0Decimals: 6,
      token1Decimals: 6,
      token0PriceUsdE8: 100_000_000n,
      token1PriceUsdE8: 100_000_000n,
      lookbackSeconds: 86_400n,
    })).toBe(364);
  });

  it("rejects zero liquidity, time, and USD value instead of inventing yield", () => {
    const base = {
      liquidity: 1n,
      sqrtPriceX96: Q96,
      feeGrowth0DeltaX128: 0n,
      feeGrowth1DeltaX128: 0n,
      token0Decimals: 6,
      token1Decimals: 6,
      token0PriceUsdE8: 100_000_000n,
      token1PriceUsdE8: 100_000_000n,
      lookbackSeconds: 86_400n,
    };
    expect(() => annualizedFullRangeFeeApyBps({ ...base, liquidity: 0n })).toThrow("positive");
    expect(() => annualizedFullRangeFeeApyBps({ ...base, lookbackSeconds: 0n })).toThrow("positive");
    expect(() => annualizedFullRangeFeeApyBps({
      ...base,
      token0PriceUsdE8: 0n,
      token1PriceUsdE8: 0n,
    })).toThrow("USD value");
  });
});
