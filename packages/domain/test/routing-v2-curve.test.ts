import { describe, expect, it } from "vitest";
import {
  CurveStableSwapNgExactInputActionV2Schema,
  CurveStableSwapNgExactInputOpportunityV2Schema,
  RouteBundleV2Schema,
  RoutePlanV2Schema,
  RouteSnapshotV2Schema,
  assessRouteAuthorizationV2,
  commitment,
  estimateRouteEconomicsV2,
  type RoutePlanV2,
  type StablecoinPolicyV2,
} from "../src/index";
import {
  assessmentContextV2,
  bundleV2,
  inputAssetV2,
  outputAssetV2,
  policyV2,
  snapshotV2,
} from "./routing-v2-fixtures";

const curveOpportunity = {
  id: "curve-stableswap-ng:usdt0-usdg:15000000",
  kind: "curve-stableswap-ng-exact-input" as const,
  adapterId: "curve-stableswap-ng@1" as const,
  pool: "0x5555555555555555555555555555555555555555" as const,
  tokenIn: inputAssetV2,
  tokenOut: outputAssetV2,
  inputIndex: 1 as const,
  outputIndex: 0 as const,
  fee: "1000000",
  quotedInputAtomic: "15000000",
  quotedOutputAtomic: "15010000",
};

const curvePolicy: StablecoinPolicyV2 = {
  ...policyV2,
  allowedAdapters: [
    "aave-v3@1",
    "curve-stableswap-ng@1",
    "uniswap-v3@1",
  ],
};

const curveSnapshot = {
  ...snapshotV2,
  scannedAdapters: curvePolicy.allowedAdapters,
  opportunities: [
    ...snapshotV2.opportunities.map((opportunity) =>
      opportunity.kind === "aave-v3-supply" && opportunity.asset === outputAssetV2
        ? { ...opportunity, validatedSupplyAtomic: curveOpportunity.quotedOutputAtomic }
        : opportunity),
    curveOpportunity,
  ],
};

const curvePlan: RoutePlanV2 = {
  ...bundleV2.routePlan,
  legs: [{
    id: "curve-then-supply",
    inputAtomic: "15000000",
    actions: [{
      kind: "curve-stableswap-ng-exact-input" as const,
      opportunityId: curveOpportunity.id,
      consume: "all" as const,
      tokenIn: inputAssetV2,
      tokenOut: outputAssetV2,
      inputIndex: 1 as const,
      outputIndex: 0 as const,
      pool: curveOpportunity.pool,
      fee: curveOpportunity.fee,
      quotedOutputAtomic: curveOpportunity.quotedOutputAtomic,
      minimumOutputAtomic: "14859900",
    }, {
      kind: "aave-v3-supply" as const,
      opportunityId: "aave-v3:usdg",
      consume: "all" as const,
      asset: outputAssetV2,
    }],
  }],
};

function curveBundle(plan: RoutePlanV2 = curvePlan) {
  return RouteBundleV2Schema.parse({
    ...bundleV2,
    policyHash: commitment(curvePolicy),
    snapshotHash: commitment(RouteSnapshotV2Schema.parse(curveSnapshot)),
    routePlan: plan,
    estimatedPreGasApyBps: 72,
  });
}

describe("Curve StableSwap NG V2 route binding", () => {
  it("accepts an amount-bound Curve quote followed by exact Aave supply", () => {
    const snapshot = RouteSnapshotV2Schema.parse(curveSnapshot);
    const plan = RoutePlanV2Schema.parse(curvePlan);
    const bundle = curveBundle(plan);

    expect(CurveStableSwapNgExactInputOpportunityV2Schema.parse(curveOpportunity))
      .toEqual(curveOpportunity);
    expect(CurveStableSwapNgExactInputActionV2Schema.parse(plan.legs[0]!.actions[0]))
      .toEqual(plan.legs[0]!.actions[0]);
    expect(estimateRouteEconomicsV2(curvePolicy, snapshot, plan))
      .toEqual({ estimatedPreGasApyBps: 72, positiveGain: true });
    expect(assessRouteAuthorizationV2(
      curvePolicy,
      snapshot,
      bundle,
      assessmentContextV2,
    )).toEqual({ authorizationValid: true, errorCodes: [] });
  });

  it.each([
    ["pool", { pool: "0x6666666666666666666666666666666666666666" }],
    ["pool indices", { inputIndex: 0, outputIndex: 1 }],
    ["quote", { quotedOutputAtomic: "15009999" }],
  ])("rejects a route that mutates the Curve %s", (_, mutation) => {
    const snapshot = RouteSnapshotV2Schema.parse(curveSnapshot);
    const first = curvePlan.legs[0]!.actions[0];
    const routePlan = RoutePlanV2Schema.parse({
      ...curvePlan,
      legs: [{
        ...curvePlan.legs[0],
        actions: [{ ...first, ...mutation }, curvePlan.legs[0]!.actions[1]],
      }],
    });
    expect(assessRouteAuthorizationV2(
      curvePolicy,
      snapshot,
      curveBundle(routePlan),
      assessmentContextV2,
    ).authorizationValid).toBe(false);
  });
});
