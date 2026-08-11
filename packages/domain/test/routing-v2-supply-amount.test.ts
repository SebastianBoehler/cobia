import { describe, expect, it } from "vitest";
import {
  AaveV3SupplyOpportunityV2Schema,
  RouteBundleV2Schema,
  RouteSnapshotV2Schema,
  assessRouteAuthorizationV2,
  commitment,
} from "../src/index";
import {
  assessmentContextV2,
  bundleV2,
  policyV2,
  routePlanV2,
  snapshotV2,
} from "./routing-v2-fixtures";

describe("V2 validated Aave supply amounts", () => {
  it("requires the exact amount validated by capture", () => {
    const opportunity = snapshotV2.opportunities[0];
    if (opportunity?.kind !== "aave-v3-supply") {
      throw new Error("fixture mismatch");
    }
    const validated = {
      ...opportunity,
      validatedSupplyAtomic: "15000000",
    } as Record<string, unknown>;
    const missing = { ...validated };
    delete missing.validatedSupplyAtomic;

    expect(AaveV3SupplyOpportunityV2Schema.safeParse(validated).success).toBe(true);
    expect(AaveV3SupplyOpportunityV2Schema.safeParse(missing).success).toBe(false);
  });

  it.each(["14999999", "15000001"])(
    "rejects direct supply of %s against the captured amount",
    (inputAtomic) => {
      const bundle = RouteBundleV2Schema.parse({
        ...bundleV2,
        routePlan: {
          ...routePlanV2,
          retainedAtomic:
            (BigInt(routePlanV2.inputAtomic) - BigInt(inputAtomic)).toString(),
          legs: [{
            id: "direct-supply",
            inputAtomic,
            actions: [{
              kind: "aave-v3-supply",
              opportunityId: "aave-v3:usdt0",
              consume: "all",
              asset: policyV2.asset,
            }],
          }],
        },
      });

      expect(assessRouteAuthorizationV2(
        policyV2,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes).toContain("OPPORTUNITY_AMOUNT_MISMATCH");
    },
  );

  it.each(["14999999", "15000001"])(
    "rejects captured output supply of %s against the swap quote",
    (validatedSupplyAtomic) => {
      const snapshot = RouteSnapshotV2Schema.parse({
        ...snapshotV2,
        opportunities: snapshotV2.opportunities.map((opportunity) =>
          opportunity.kind === "aave-v3-supply" &&
          opportunity.asset !== policyV2.asset
            ? { ...opportunity, validatedSupplyAtomic }
            : opportunity
        ),
      });
      const bundle = RouteBundleV2Schema.parse({
        ...bundleV2,
        snapshotHash: commitment(snapshot),
      });

      expect(assessRouteAuthorizationV2(
        policyV2,
        snapshot,
        bundle,
        assessmentContextV2,
      ).errorCodes).toContain("OPPORTUNITY_AMOUNT_MISMATCH");
    },
  );
});
