import {
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { buildDeterministicRouteBundleV2 } from "../src/index";
import {
  routeBuilderOptions,
  routeInputAsset,
  routeNowSec,
  routeOutputAsset,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

function policy(objective: unknown) {
  return StablecoinPolicyV2Schema.parse({
    ...routePolicy,
    protocolExposureBps: 10_000,
    minPreGasApyBps: 0,
    objective,
  });
}

function snapshot(opportunities: unknown[]) {
  return RouteSnapshotV2Schema.parse({ ...routeSnapshot, opportunities });
}

function build(objectivePolicy: ReturnType<typeof policy>, objectiveSnapshot: ReturnType<typeof snapshot>) {
  return buildDeterministicRouteBundleV2({
    policy: objectivePolicy,
    snapshot: objectiveSnapshot,
    nowSec: routeNowSec,
  }, routeBuilderOptions);
}

const forward = {
  id: "swap:terminal:100000000",
  kind: "uniswap-v3-exact-input" as const,
  adapterId: "uniswap-v3@1" as const,
  tokenIn: routeInputAsset,
  tokenOut: routeOutputAsset,
  feeTier: 100,
  quotedInputAtomic: "100000000",
  quotedOutputAtomic: "99800000",
  estimatedGas: "100000",
};

describe("V2 objective route candidates", () => {
  it("selects the best terminal swap that satisfies the signed receive floor", () => {
    const bundle = build(
      policy({ kind: "swap", outputAsset: routeOutputAsset, minimumOutputAtomic: "99000000" }),
      snapshot([forward]),
    );

    expect(bundle).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: {
        retainedAtomic: "0",
        legs: [{
          inputAtomic: "100000000",
          actions: [{
            kind: "uniswap-v3-exact-input",
            opportunityId: forward.id,
            minimumOutputAtomic: "99000000",
          }],
        }],
      },
    });
  });

  it("builds a conservative profitable round trip from two committed quotes", () => {
    const profitableForward = { ...forward, quotedOutputAtomic: "100500000" };
    const reverse = {
      ...forward,
      id: "swap:return:99495000",
      tokenIn: routeOutputAsset,
      tokenOut: routeInputAsset,
      quotedInputAtomic: "99495000",
      quotedOutputAtomic: "101000000",
    };
    const bundle = build(
      policy({ kind: "profit", minimumFinalAtomic: "100500000" }),
      snapshot([profitableForward, reverse]),
    );

    expect(bundle.routePlan).toMatchObject({
      retainedAtomic: "0",
      legs: [{ actions: [
        { opportunityId: profitableForward.id, consume: "all" },
        {
          opportunityId: reverse.id,
          consume: "exact",
          inputAtomic: "99495000",
          minimumOutputAtomic: "100500000",
        },
      ] }],
    });
  });

  it("does not publish a Profit route below its signed final balance", () => {
    expect(() => build(
      policy({ kind: "profit", minimumFinalAtomic: "101500000" }),
      snapshot([forward]),
    )).toThrow(/objective|candidate/i);
  });
});
