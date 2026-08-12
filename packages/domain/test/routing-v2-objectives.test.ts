import { describe, expect, it } from "vitest";
import {
  RoutePlanV2Schema,
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
  assessRouteAuthorizationV2,
  commitment,
  estimateRouteEconomicsV2,
  routeObjectiveV2,
} from "../src/index";
import {
  inputAssetV2,
  outputAssetV2,
  policyV2,
  routePlanV2,
  snapshotV2,
  assessmentContextV2,
} from "./routing-v2-fixtures";

const standaloneSwap = {
  version: 2,
  inputAsset: inputAssetV2,
  inputAtomic: "15000000",
  retainedAtomic: "0",
  horizonDays: 30,
  legs: [{
    id: "terminal-swap",
    inputAtomic: "15000000",
    actions: [routePlanV2.legs[0]!.actions[0]],
  }],
} as const;

const reverseSwap = {
  kind: "uniswap-v3-exact-input",
  opportunityId: "uniswap-v3:return:14925000",
  consume: "exact",
  inputAtomic: "14925000",
  tokenIn: outputAssetV2,
  tokenOut: inputAssetV2,
  quotedOutputAtomic: "15100000",
  minimumOutputAtomic: "15050000",
} as const;

describe("V2 outcome objectives", () => {
  it("keeps legacy policies explicitly equivalent to Earn", () => {
    expect(routeObjectiveV2(StablecoinPolicyV2Schema.parse(policyV2))).toEqual({ kind: "earn" });
  });

  it("accepts a signed terminal Swap objective and canonicalizes its output", () => {
    const policy = StablecoinPolicyV2Schema.parse({
      ...policyV2,
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: {
        kind: "swap",
        outputAsset: "0x4444444444444444444444444444444444444444",
        minimumOutputAtomic: "14900000",
      },
    });

    expect(routeObjectiveV2(policy)).toEqual({
      kind: "swap",
      outputAsset: outputAssetV2,
      minimumOutputAtomic: "14900000",
    });
  });

  it("rejects contradictory Swap and Profit objectives", () => {
    expect(StablecoinPolicyV2Schema.safeParse({
      ...policyV2,
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "swap", outputAsset: inputAssetV2, minimumOutputAtomic: "1" },
    }).success).toBe(false);
    expect(StablecoinPolicyV2Schema.safeParse({
      ...policyV2,
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "profit", minimumFinalAtomic: policyV2.principalAtomic },
    }).success).toBe(false);
  });

  it("accepts a terminal exact-input swap", () => {
    expect(RoutePlanV2Schema.parse(standaloneSwap)).toEqual(standaloneSwap);
  });

  it("accepts a bounded round trip with a conservative exact second input", () => {
    const plan = {
      ...standaloneSwap,
      legs: [{
        ...standaloneSwap.legs[0],
        id: "round-trip",
        actions: [standaloneSwap.legs[0].actions[0], reverseSwap],
      }],
    };
    expect(RoutePlanV2Schema.parse(plan)).toEqual(plan);
  });

  it("rejects a round trip that cannot be funded by the first swap minimum", () => {
    const plan = {
      ...standaloneSwap,
      legs: [{
        ...standaloneSwap.legs[0],
        actions: [standaloneSwap.legs[0].actions[0], {
          ...reverseSwap,
          inputAtomic: "14925001",
        }],
      }],
    };
    expect(RoutePlanV2Schema.safeParse(plan).success).toBe(false);
  });

  it("authorizes a terminal Swap only when its signed output floor is met", () => {
    const policy = StablecoinPolicyV2Schema.parse({
      ...policyV2,
      principalAtomic: "15000000",
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "swap", outputAsset: outputAssetV2, minimumOutputAtomic: "14900000" },
    });
    const routePlan = RoutePlanV2Schema.parse(standaloneSwap);
    const first = routePlan.legs[0]!.actions[0];
    if (first.kind !== "uniswap-v3-exact-input") throw new Error("Expected Uniswap swap");
    const bundle = {
      version: 2 as const,
      requestId: policy.requestId,
      solverId: "objective-solver",
      solverAddress: policy.owner,
      policyHash: commitment(policy),
      snapshotHash: commitment(snapshotV2),
      routePlan,
      evidence: [],
      riskFlags: [],
      estimatedPreGasApyBps: 0,
      validUntil: policy.deadline,
    };

    expect(assessRouteAuthorizationV2(
      policy, snapshotV2, bundle, assessmentContextV2,
    )).toEqual({ authorizationValid: true, errorCodes: [] });
    expect(assessRouteAuthorizationV2(policy, snapshotV2, {
      ...bundle,
      routePlan: {
        ...routePlan,
        legs: [{
          ...routePlan.legs[0],
          actions: [{
            ...first,
            minimumOutputAtomic: "14899999",
          }],
        }],
      },
    }, assessmentContextV2).errorCodes).toContain("OBJECTIVE_MINIMUM_NOT_MET");
  });

  it("authorizes Profit only when the bounded return ends above principal", () => {
    const policy = StablecoinPolicyV2Schema.parse({
      ...policyV2,
      principalAtomic: "15000000",
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "profit", minimumFinalAtomic: "15050000" },
    });
    const snapshot = RouteSnapshotV2Schema.parse({
      ...snapshotV2,
      opportunities: [...snapshotV2.opportunities, {
        id: reverseSwap.opportunityId,
        kind: "uniswap-v3-exact-input" as const,
        adapterId: "uniswap-v3@1" as const,
        tokenIn: outputAssetV2,
        tokenOut: inputAssetV2,
        feeTier: 100,
        quotedInputAtomic: reverseSwap.inputAtomic,
        quotedOutputAtomic: reverseSwap.quotedOutputAtomic,
        estimatedGas: "100000",
      }],
    });
    const plan = RoutePlanV2Schema.parse({
      ...standaloneSwap,
      legs: [{
        ...standaloneSwap.legs[0],
        id: "round-trip",
        actions: [standaloneSwap.legs[0].actions[0], reverseSwap],
      }],
    });
    const assessment = assessRouteAuthorizationV2(policy, snapshot, {
      version: 2,
      requestId: policy.requestId,
      solverId: "objective-solver",
      solverAddress: policy.owner,
      policyHash: commitment(policy),
      snapshotHash: commitment(snapshot),
      routePlan: plan,
      evidence: [], riskFlags: [], estimatedPreGasApyBps: 0,
      validUntil: policy.deadline,
    }, assessmentContextV2);

    expect(assessment).toEqual({ authorizationValid: true, errorCodes: [] });
    expect(estimateRouteEconomicsV2(policy, snapshot, plan)).toEqual({
      estimatedPreGasApyBps: 0,
      positiveGain: true,
    });
  });

  it("treats a signed terminal Swap as an outcome, not as missing yield", () => {
    const policy = StablecoinPolicyV2Schema.parse({
      ...policyV2,
      principalAtomic: "15000000",
      protocolExposureBps: 10_000,
      minPreGasApyBps: 0,
      objective: { kind: "swap", outputAsset: outputAssetV2, minimumOutputAtomic: "14900000" },
    });
    expect(estimateRouteEconomicsV2(
      policy, snapshotV2, RoutePlanV2Schema.parse(standaloneSwap),
    )).toEqual({ estimatedPreGasApyBps: 0, positiveGain: true });
  });
});
