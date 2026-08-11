import { describe, expect, it } from "vitest";
import { calculatePendingTreasury } from "./aave-math";

describe("calculatePendingTreasury", () => {
  it("matches Aave linear-interest and half-ray-up rounding", () => {
    expect(calculatePendingTreasury({
      accruedToTreasuryScaled: 10_000_000n,
      liquidityRateRay: 30_000_000_000_000_000_000_000_000n,
      currentLiquidityIndexRay: 1_010_000_000_000_000_000_000_000_000n,
      lastUpdateTimestamp: 1_786_418_298n,
      blockTimestamp: 1_786_418_398n,
    })).toEqual({
      nextLiquidityIndexRay: 1_010_000_096_080_669_710_806_697_107n,
      pendingTreasuryAtomic: 10_100_000n,
    });
  });

  it("rejects a block timestamp before the reserve update", () => {
    expect(() => calculatePendingTreasury({
      accruedToTreasuryScaled: 1n,
      liquidityRateRay: 1n,
      currentLiquidityIndexRay: 10n ** 27n,
      lastUpdateTimestamp: 2n,
      blockTimestamp: 1n,
    })).toThrow("timestamp");
  });
});
