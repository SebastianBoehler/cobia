import { describe, expect, it } from "vitest";
import { calculateCompositionNetYieldObjectiveV1 } from "./composition-objective";

const hash = `0x${"11".repeat(32)}` as const;

describe("composition net-yield objective", () => {
  it("normalizes receipt value, horizon yield, gas, and fee into USD E8", () => {
    const objective = calculateCompositionNetYieldObjectiveV1({
      receiptAtomic: "999000", receiptDecimals: 6, receiptPriceUsdE8: "100000000",
      supplyRateBps: 500, horizonDays: 30,
      expectedGas: 1_200_000, gasPriceAtomic: "1000000000",
      nativePriceUsdE8: "10741000000", solverFeeAtomic: "0", evidenceHash: hash,
    });
    const receipt = 99_900_000n;
    const yieldValue = receipt * 500n * 30n / (365n * 10_000n);
    const gas = 1_200_000n * 1_000_000_000n * 10_741_000_000n / 10n ** 18n;

    expect(objective).toEqual({
      version: 2, kind: "composition-net-yield-usd-e8", direction: "maximize",
      atomic: (receipt + yieldValue - gas).toString(), horizonDays: 30,
      evaluator: "composition-net-yield@1", evidenceHash: hash,
    });
  });

  it("uses deterministic floor rounding and never emits a negative rank", () => {
    expect(calculateCompositionNetYieldObjectiveV1({
      receiptAtomic: "1", receiptDecimals: 6, receiptPriceUsdE8: "100000000",
      supplyRateBps: 1, horizonDays: 1, expectedGas: 20_000_000,
      gasPriceAtomic: "100000000000", nativePriceUsdE8: "10000000000",
      solverFeeAtomic: "1", evidenceHash: hash,
    }).atomic).toBe("0");
  });
});
