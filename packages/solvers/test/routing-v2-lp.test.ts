import { describe, expect, it } from "vitest";
import { RouteSnapshotV2Schema } from "@cobia/domain";
import {
  buildDeterministicRouteBundleV2,
  listRouteCandidateSummariesV2,
} from "../src/index";
import {
  routeBuilderOptions,
  routeInputAsset,
  routeNowSec,
  routeOutputAsset,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

const lpOpportunity = {
  id: "lp:input-output:50000000",
  kind: "uniswap-v3-full-range-lp",
  adapterId: "uniswap-v3@1",
  pool: "0x4444444444444444444444444444444444444444",
  token0: routeInputAsset,
  token1: routeOutputAsset,
  feeTier: 100,
  tickLower: -887272,
  tickUpper: 887272,
  historicalFeeApyBps: 1_000,
  tvlUsdE6: "500000000000",
  lookbackSeconds: 86_400,
  validatedInputAsset: routeInputAsset,
  validatedInputAtomic: "50000000",
  balanceSwapInputAtomic: "25000000",
  quotedSwapOutputAtomic: "24950000",
  amount0DesiredAtomic: "25000000",
  amount1DesiredAtomic: "24950000",
  quotedLiquidity: "24950000",
  minimumLiquidity: "24700500",
} as const;

describe("deterministic V2 LP routing", () => {
  it("ranks a higher historical-fee LP route and binds every executable floor", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...routeSnapshot,
      opportunities: [...routeSnapshot.opportunities, lpOpportunity],
    });
    const input = { policy: routePolicy, snapshot, nowSec: routeNowSec };
    const bundle = buildDeterministicRouteBundleV2(input, routeBuilderOptions);

    expect(bundle).toMatchObject({
      estimatedPreGasApyBps: 438,
      routePlan: {
        retainedAtomic: "50000000",
        legs: [{
          inputAtomic: "50000000",
          actions: [{
            kind: "uniswap-v3-balance-swap",
            opportunityId: lpOpportunity.id,
            inputAtomic: "25000000",
            quotedOutputAtomic: "24950000",
            minimumOutputAtomic: "24700500",
          }, {
            kind: "uniswap-v3-full-range-mint",
            opportunityId: lpOpportunity.id,
            amount0DesiredAtomic: "25000000",
            amount1DesiredAtomic: "24950000",
            amount0MinAtomic: "24750000",
            amount1MinAtomic: "24700500",
            quotedLiquidity: "24950000",
            minimumLiquidity: "24700500",
          }],
        }],
      },
    });
    expect(listRouteCandidateSummariesV2(input)[0]).toMatchObject({
      estimatedPreGasApyBps: 438,
      actions: ["uniswap-v3-balance-swap", "uniswap-v3-full-range-mint"],
    });
  });

  it("does not use an LP quote for another exact deployed amount", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...routeSnapshot,
      opportunities: [
        ...routeSnapshot.opportunities,
        {
          ...lpOpportunity,
          validatedInputAtomic: "49999999",
          amount0DesiredAtomic: "24999999",
        },
      ],
    });
    const bundle = buildDeterministicRouteBundleV2(
      { policy: routePolicy, snapshot, nowSec: routeNowSec },
      routeBuilderOptions,
    );
    expect(bundle.routePlan.legs[0]?.actions[0].kind).toBe("uniswap-v3-exact-input");
  });

  it("does not route into an LP below the signed minimum TVL", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...routeSnapshot,
      opportunities: [
        ...routeSnapshot.opportunities,
        { ...lpOpportunity, tvlUsdE6: "999999" },
      ],
    });
    const bundle = buildDeterministicRouteBundleV2(
      { policy: routePolicy, snapshot, nowSec: routeNowSec },
      routeBuilderOptions,
    );
    expect(bundle.routePlan.legs[0]?.actions[0].kind).toBe("uniswap-v3-exact-input");
  });
});
