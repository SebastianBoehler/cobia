import { describe, expect, it } from "vitest";
import {
  RouteBundleV2Schema,
  assessRouteAuthorizationV2,
} from "../src/index";
import {
  assessmentContextV2,
  bundleV2,
  policyV2,
  routePlanV2,
  snapshotV2,
} from "./routing-v2-fixtures";

describe("V2 exact protocol exposure", () => {
  it.each(["14999999", "15000001"])(
    "rejects an action route deploying %s atomic",
    (inputAtomic) => {
      const bundle = RouteBundleV2Schema.parse({
        ...bundleV2,
        routePlan: {
          ...routePlanV2,
          retainedAtomic:
            (BigInt(routePlanV2.inputAtomic) - BigInt(inputAtomic)).toString(),
          legs: [{ ...routePlanV2.legs[0], inputAtomic }],
        },
      });

      expect(assessRouteAuthorizationV2(
        policyV2,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes).toContain("PROTOCOL_EXPOSURE_MISMATCH");
    },
  );
});
