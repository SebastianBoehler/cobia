import { describe, expect, it } from "vitest";
import {
  RouteBundleV2Schema,
  RoutePlanV2Schema,
  RouteSnapshotV2Schema,
  assessRouteAuthorizationV2,
  commitment,
  estimateRouteEconomicsV2,
} from "../src/index";
import {
  assessmentContextV2,
  bundleV2,
  inputAssetV2,
  outputAssetV2,
  policyV2,
  snapshotV2,
} from "./routing-v2-fixtures";

const lpOpportunity = {
  id: "uniswap-v3-lp:usdt0-usdg:100:15000000",
  kind: "uniswap-v3-full-range-lp",
  adapterId: "uniswap-v3@1",
  pool: "0x6666666666666666666666666666666666666666",
  token0: inputAssetV2,
  token1: outputAssetV2,
  feeTier: 100,
  tickLower: -887272,
  tickUpper: 887272,
  historicalFeeApyBps: 420,
  tvlUsdE6: "500000000000",
  lookbackSeconds: 86_400,
  validatedInputAsset: inputAssetV2,
  validatedInputAtomic: "15000000",
  balanceSwapInputAtomic: "7500000",
  quotedSwapOutputAtomic: "7490000",
  amount0DesiredAtomic: "7500000",
  amount1DesiredAtomic: "7490000",
  quotedLiquidity: "1000000000000",
  minimumLiquidity: "990000000000",
} as const;

const lpSnapshot = RouteSnapshotV2Schema.parse({
  ...snapshotV2,
  opportunities: [lpOpportunity],
});

const lpPlan = {
  version: 2,
  inputAsset: inputAssetV2,
  inputAtomic: policyV2.principalAtomic,
  retainedAtomic: "10000001",
  horizonDays: policyV2.horizonDays,
  legs: [{
    id: "full-range-lp",
    inputAtomic: "15000000",
    actions: [{
      kind: "uniswap-v3-balance-swap",
      opportunityId: lpOpportunity.id,
      inputAtomic: "7500000",
      tokenIn: inputAssetV2,
      tokenOut: outputAssetV2,
      quotedOutputAtomic: "7490000",
      minimumOutputAtomic: "7415100",
    }, {
      kind: "uniswap-v3-full-range-mint",
      opportunityId: lpOpportunity.id,
      token0: inputAssetV2,
      token1: outputAssetV2,
      feeTier: 100,
      tickLower: -887272,
      tickUpper: 887272,
      amount0DesiredAtomic: "7500000",
      amount1DesiredAtomic: "7490000",
      amount0MinAtomic: "7425000",
      amount1MinAtomic: "7415100",
      quotedLiquidity: "1000000000000",
      minimumLiquidity: "990000000000",
    }],
  }],
} as const;

describe("V2 full-range Uniswap LP routes", () => {
  it("commits an amount-specific historical-fee LP opportunity", () => {
    expect(lpSnapshot.opportunities).toEqual([lpOpportunity]);
    expect(RouteSnapshotV2Schema.safeParse({
      ...lpSnapshot,
      opportunities: [{ ...lpOpportunity, historicalFeeApyBps: -1 }],
    }).success).toBe(false);
  });

  it("permits a partial balance swap followed by one bounded LP mint", () => {
    expect(RoutePlanV2Schema.parse(lpPlan)).toEqual(lpPlan);
    expect(RoutePlanV2Schema.safeParse({
      ...lpPlan,
      legs: [{
        ...lpPlan.legs[0],
        actions: [
          { ...lpPlan.legs[0].actions[0], inputAtomic: "7500001" },
          lpPlan.legs[0].actions[1],
        ],
      }],
    }).success).toBe(false);
  });

  it("binds every LP amount, pool range, asset, and slippage floor", () => {
    const plan = RoutePlanV2Schema.parse(lpPlan);
    const bundle = RouteBundleV2Schema.parse({
      ...bundleV2,
      snapshotHash: commitment(lpSnapshot),
      routePlan: plan,
      estimatedPreGasApyBps: 203,
    });
    expect(assessRouteAuthorizationV2(
      policyV2,
      lpSnapshot,
      bundle,
      assessmentContextV2,
    )).toEqual({ authorizationValid: true, errorCodes: [] });

    const weakLiquidityFloor = RouteBundleV2Schema.parse({
      ...bundle,
      routePlan: {
        ...plan,
        legs: [{
          ...plan.legs[0],
          actions: [
            plan.legs[0]!.actions[0],
            { ...plan.legs[0]!.actions[1], minimumLiquidity: "989999999999" },
          ],
        }],
      },
    });
    expect(assessRouteAuthorizationV2(
      policyV2,
      lpSnapshot,
      weakLiquidityFloor,
      assessmentContextV2,
    ).errorCodes).toContain("SLIPPAGE_LIMIT_EXCEEDED");

    const mutated = RouteBundleV2Schema.parse({
      ...bundle,
      routePlan: {
        ...plan,
        legs: [{
          ...plan.legs[0],
          actions: [
            plan.legs[0]!.actions[0],
            { ...plan.legs[0]!.actions[1], tickLower: -887271 },
          ],
        }],
      },
    });
    expect(assessRouteAuthorizationV2(
      policyV2,
      lpSnapshot,
      mutated,
      assessmentContextV2,
    ).errorCodes).toContain("OPPORTUNITY_ROUTE_MISMATCH");

    const lowTvlSnapshot = RouteSnapshotV2Schema.parse({
      ...lpSnapshot,
      opportunities: [{ ...lpOpportunity, tvlUsdE6: "999999" }],
    });
    const lowTvlBundle = RouteBundleV2Schema.parse({
      ...bundle,
      snapshotHash: commitment(lowTvlSnapshot),
    });
    expect(assessRouteAuthorizationV2(
      policyV2,
      lowTvlSnapshot,
      lowTvlBundle,
      assessmentContextV2,
    ).errorCodes).toContain("TVL_BELOW_MINIMUM");
  });

  it("recomputes LP economics from historical fees and one-time swap loss", () => {
    expect(estimateRouteEconomicsV2(
      policyV2,
      lpSnapshot,
      RoutePlanV2Schema.parse(lpPlan),
    )).toEqual({ estimatedPreGasApyBps: 203, positiveGain: true });
  });
});
