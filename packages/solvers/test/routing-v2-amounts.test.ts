import type { RouteSnapshotV2, StablecoinPolicyV2 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { buildDeterministicRouteBundleV2 } from "../src/index";
import {
  routeBuilderOptions,
  routeNowSec,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

function build(
  policy: StablecoinPolicyV2 = routePolicy,
  snapshot: RouteSnapshotV2 = routeSnapshot,
) {
  return buildDeterministicRouteBundleV2(
    { policy, snapshot, nowSec: routeNowSec },
    routeBuilderOptions,
  );
}

function firstAction(bundle: ReturnType<typeof build>) {
  return bundle.routePlan.legs[0]?.actions[0];
}

describe("deterministic V2 validated supply pairing", () => {
  it("uses no-action when direct supply was validated for another amount", () => {
    const opportunities = routeSnapshot.opportunities
      .filter((opportunity) => opportunity.id === "aave:input")
      .map((opportunity) => ({
        ...opportunity,
        validatedSupplyAtomic: "49999999",
      }));

    expect(build(routePolicy, { ...routeSnapshot, opportunities })).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: { retainedAtomic: "100000000", legs: [] },
    });
  });

  it("falls back to direct supply when output validation misses the quote", () => {
    const opportunities = routeSnapshot.opportunities.map((opportunity) =>
      opportunity.id === "aave:output"
        ? { ...opportunity, validatedSupplyAtomic: "49899999" }
        : opportunity
    );

    expect(firstAction(build(routePolicy, {
      ...routeSnapshot,
      opportunities,
    }))).toMatchObject({
      kind: "aave-v3-supply",
      opportunityId: "aave:input",
    });
  });

  it("pairs the floored exposure amount for an odd principal", () => {
    const bundle = build({ ...routePolicy, principalAtomic: "100000001" });
    expect(bundle.routePlan).toMatchObject({
      retainedAtomic: "50000001",
      legs: [{ inputAtomic: "50000000" }],
    });
  });
});
