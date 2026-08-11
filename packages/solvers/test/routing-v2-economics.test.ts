import { describe, expect, it } from "vitest";
import { buildDeterministicRouteBundleV2 } from "../src/index";
import {
  routeBuilderOptions,
  routeNowSec,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

describe("deterministic V2 route economics", () => {
  it("preserves exact gain ordering when published APY floors tie", () => {
    const direct = routeSnapshot.opportunities.find(
      (opportunity) => opportunity.id === "aave:input",
    );
    if (direct?.kind !== "aave-v3-supply") throw new Error("fixture mismatch");
    const opportunities = [
      { ...direct, id: "aave:aaa", supplyRateBps: 500 },
      { ...direct, id: "aave:zzz", supplyRateBps: 501 },
    ];

    const bundle = buildDeterministicRouteBundleV2(
      {
        policy: routePolicy,
        snapshot: { ...routeSnapshot, opportunities },
        nowSec: routeNowSec,
      },
      routeBuilderOptions,
    );

    expect(bundle.estimatedPreGasApyBps).toBe(250);
    expect(bundle.routePlan.legs[0]?.actions[0]).toMatchObject({
      opportunityId: "aave:zzz",
    });
  });
});
