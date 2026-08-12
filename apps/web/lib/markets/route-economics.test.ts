import { describe, expect, it } from "vitest";
import {
  formatUsdE8,
  projectRouteEconomicsForHorizon,
} from "./route-economics";

describe("retail route economics", () => {
  it("shows that a 10 USD route at 0.41% APY cannot repay a 0.10 reveal in 30 days", () => {
    const result = projectRouteEconomicsForHorizon({
      principalAtomic: "10000000",
      decimals: 6,
      priceUsdE8: "100000000",
      estimatedPreGasApyBps: 41,
      horizonDays: 30,
      revealFeeUsdE8: 10_000_000n,
    });

    expect(result).toEqual({
      principalUsdE8: 1_000_000_000n,
      estimatedGrossYieldUsdE8: 336_986n,
      revealFeeUsdE8: 10_000_000n,
      netBeforeGasUsdE8: -9_663_014n,
      breakEvenPrincipalUsdE8: 29_674_796_748n,
      status: "not-economical",
    });
    expect(formatUsdE8(result.estimatedGrossYieldUsdE8)).toBe("$0.0034");
    expect(formatUsdE8(result.breakEvenPrincipalUsdE8!)).toBe("$296.75");
  });

  it("labels a route positive only when estimated horizon yield clears reveal before gas", () => {
    expect(projectRouteEconomicsForHorizon({
      principalAtomic: "100000000",
      decimals: 6,
      priceUsdE8: "100000000",
      estimatedPreGasApyBps: 400,
      horizonDays: 30,
      revealFeeUsdE8: 10_000_000n,
    }).status).toBe("positive-before-gas");
  });

  it("formats USD values exactly beyond JavaScript's safe integer range", () => {
    expect(formatUsdE8(900_719_925_474_099_312_345_678n))
      .toBe("$9,007,199,254,740,993.12");
    expect(formatUsdE8(-1n)).toBe("−$0.0000");
  });
});
