import { describe, expect, it } from "vitest";
import type { RouteSnapshotV2, StablecoinPolicyV2 } from "@cobia/domain";
import {
  buildDeterministicRouteBundleV2,
  listRouteCandidateSummariesV2,
} from "../src/index";
import {
  routeBuilderOptions,
  routeNowSec,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

const curvePool = "0x5555555555555555555555555555555555555555" as const;
const curveOutput = "50010000";
const curveMinimumOutput = "49509900";
const outputAsset = routePolicy.allowedOutputAssets[1]!;
const policy: StablecoinPolicyV2 = {
  ...routePolicy,
  allowedAdapters: [
    "aave-v3@1",
    "curve-stableswap-ng@1",
    "uniswap-v3@1",
  ],
};
const snapshot: RouteSnapshotV2 = {
  ...routeSnapshot,
  scannedAdapters: policy.allowedAdapters,
  opportunities: [
    ...routeSnapshot.opportunities.map((opportunity) =>
      opportunity.kind === "aave-v3-supply" && opportunity.asset === outputAsset
        ? { ...opportunity, validatedSupplyAtomic: curveMinimumOutput }
        : opportunity),
    {
      id: "curve:input-output:50000000",
      kind: "curve-stableswap-ng-exact-input" as const,
      adapterId: "curve-stableswap-ng@1" as const,
      pool: curvePool,
      tokenIn: routePolicy.asset,
      tokenOut: outputAsset,
      inputIndex: 0 as const,
      outputIndex: 1 as const,
      fee: "1000000",
      quotedInputAtomic: "50000000",
      quotedOutputAtomic: curveOutput,
    },
  ],
};

describe("Curve StableSwap NG solver candidates", () => {
  it("compares Curve against direct and Uniswap routes using exact economics", () => {
    const input = { policy, snapshot, nowSec: routeNowSec };
    const summaries = listRouteCandidateSummariesV2(input);
    const bundle = buildDeterministicRouteBundleV2(input, routeBuilderOptions);

    expect(summaries.some(({ id }) => id.startsWith("curve:"))).toBe(true);
    expect(bundle.routePlan.legs[0]?.actions).toMatchObject([{
      kind: "curve-stableswap-ng-exact-input",
      pool: curvePool,
      inputIndex: 0,
      outputIndex: 1,
      quotedOutputAtomic: curveOutput,
      minimumOutputAtomic: curveMinimumOutput,
    }, {
      kind: "aave-v3-supply",
      asset: outputAsset,
    }]);
  });

  it("does not build a Curve route from a quote for another exact amount", () => {
    const opportunities = snapshot.opportunities.map((opportunity) =>
      opportunity.kind === "curve-stableswap-ng-exact-input"
        ? { ...opportunity, quotedInputAtomic: "49999999" }
        : opportunity);
    const summaries = listRouteCandidateSummariesV2({
      policy,
      snapshot: { ...snapshot, opportunities },
      nowSec: routeNowSec,
    });

    expect(summaries.some(({ id }) => id.startsWith("curve:"))).toBe(false);
  });
});
