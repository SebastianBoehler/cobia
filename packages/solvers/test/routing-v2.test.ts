import type { RouteSnapshotV2, StablecoinPolicyV2 } from "@cobia/domain";
import { assessRouteAuthorizationV2, commitment } from "@cobia/domain";
import { isAddressEqual, recoverMessageAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildDeterministicRouteBundleV2,
  createDeterministicRouteSolverV2,
} from "../src/index";
import {
  routeBuilderOptions,
  routeNowSec,
  routePolicy,
  routeRegistryHash,
  routeSolverAccount,
  routeSnapshot,
} from "./routing-v2-fixtures";

function changedPolicy(change: Partial<StablecoinPolicyV2>): StablecoinPolicyV2 {
  return { ...routePolicy, ...change };
}

function changedSnapshot(change: Partial<RouteSnapshotV2>): RouteSnapshotV2 {
  return { ...routeSnapshot, ...change };
}

function build(
  policy: StablecoinPolicyV2 = routePolicy,
  snapshot: RouteSnapshotV2 = routeSnapshot,
  nowSec = routeNowSec,
) {
  return buildDeterministicRouteBundleV2(
    { policy, snapshot, nowSec },
    routeBuilderOptions,
  );
}

function firstAction(bundle: ReturnType<typeof build>) {
  return bundle.routePlan.legs[0]?.actions[0];
}

function liveQuoteCase() {
  const policy = changedPolicy({ principalAtomic: "1000000000" });
  const opportunities = routeSnapshot.opportunities.map((opportunity) => {
    if (opportunity.kind === "uniswap-v3-exact-input") {
      return {
        ...opportunity,
        id: "swap:input-output:500000000",
        quotedInputAtomic: "500000000",
        quotedOutputAtomic: "499528183",
      };
    }
    return {
      ...opportunity,
      validatedSupplyAtomic: opportunity.id === "aave:input"
        ? "500000000"
        : "499528183",
    };
  });
  return { policy, snapshot: changedSnapshot({ opportunities }) };
}

describe("deterministic V2 route builder", () => {
  it("chooses the higher-value swap-then-supply route with exact conservation", () => {
    const bundle = build();

    expect(bundle.estimatedPreGasApyBps).toBe(377);
    expect(bundle.validUntil).toBe(1_800_000_240);
    expect(bundle.routePlan).toMatchObject({
      inputAtomic: "100000000",
      retainedAtomic: "50000000",
      legs: [{
        inputAtomic: "50000000",
        actions: [
          {
            kind: "uniswap-v3-exact-input",
            opportunityId: "swap:input-output:50000000",
            quotedOutputAtomic: "49900000",
            minimumOutputAtomic: "49401000",
          },
          { kind: "aave-v3-supply", opportunityId: "aave:output" },
        ],
      }],
    });
  });

  it.each([
    ["output price", { priceUsdE8: "99000000" }],
    ["output decimals", { decimals: 18 }],
  ] as const)("uses signed %s in route value", (_, valuationChange) => {
    const valuations = routeSnapshot.valuations.map((valuation, index) =>
      index === 1 ? { ...valuation, ...valuationChange } : valuation
    );

    expect(firstAction(build(routePolicy, changedSnapshot({ valuations })))).toMatchObject({
      kind: "aave-v3-supply",
      opportunityId: "aave:input",
    });
  });

  it("uses no-action when swap loss and yield produce no positive gain", () => {
    const opportunities = routeSnapshot.opportunities.map((opportunity) => {
      if (opportunity.kind === "uniswap-v3-exact-input") {
        return { ...opportunity, quotedOutputAtomic: "49000000" };
      }
      return { ...opportunity, supplyRateBps: 0 };
    });

    expect(build(routePolicy, changedSnapshot({ opportunities }))).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: { retainedAtomic: routePolicy.principalAtomic, legs: [] },
    });
  });

  it("uses no-action when pre-gas APY cannot reach the signed pre-gas minimum", () => {
    const bundle = build(changedPolicy({ minPreGasApyBps: 9_999 }));
    expect(bundle).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: {
        retainedAtomic: routePolicy.principalAtomic,
        legs: [],
      },
    });
  });

  it("keeps a route whose pre-gas APY equals the signed pre-gas minimum", () => {
    const bundle = build(changedPolicy({ minPreGasApyBps: 377 }));
    expect(bundle.estimatedPreGasApyBps).toBe(377);
    expect(firstAction(bundle)?.kind).toBe("uniswap-v3-exact-input");
  });

  it.each([
    ["unsigned adapter", changedPolicy({ allowedAdapters: ["aave-v3@1"] })],
    ["unsigned output", changedPolicy({ allowedOutputAssets: [routePolicy.asset] })],
  ] as const)("excludes a route through an %s", (_, policy) => {
    expect(firstAction(build(policy))).toMatchObject({
      kind: "aave-v3-supply",
      opportunityId: "aave:input",
    });
  });

  it("rejects opportunities below the signed TVL minimum", () => {
    expect(build(changedPolicy({ minTvlUsdE6: "1000000000000" }))).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: { legs: [] },
    });
  });

  it("does not treat observed Aave withdrawal liquidity as a supply cap", () => {
    const opportunities = routeSnapshot.opportunities.map((opportunity) =>
      opportunity.kind === "aave-v3-supply"
        ? { ...opportunity, availableLiquidityAtomic: "0" }
        : opportunity
    );
    const bundle = build(routePolicy, changedSnapshot({ opportunities }));
    expect(bundle.estimatedPreGasApyBps).toBe(377);
    expect(firstAction(bundle)?.kind).toBe("uniswap-v3-exact-input");
  });

  it("uses only a swap quote for the exact signed exposure amount", () => {
    const opportunities = routeSnapshot.opportunities.map((opportunity) =>
      opportunity.kind === "uniswap-v3-exact-input"
        ? { ...opportunity, quotedInputAtomic: "49000000" }
        : opportunity
    );
    expect(firstAction(build(routePolicy, changedSnapshot({ opportunities })))).toMatchObject({
      kind: "aave-v3-supply",
      opportunityId: "aave:input",
    });
  });

  it("derives exact deployment from the signed exposure allocation", () => {
    const opportunities = routeSnapshot.opportunities.map((opportunity) => {
      if (opportunity.kind === "uniswap-v3-exact-input") {
        return {
          ...opportunity,
          quotedInputAtomic: "40000000",
          quotedOutputAtomic: "39920000",
        };
      }
      return {
        ...opportunity,
        validatedSupplyAtomic: opportunity.id === "aave:input"
          ? "40000000"
          : "39920000",
      };
    });
    const bundle = build(
      changedPolicy({
        principalAtomic: "100000001",
        protocolExposureBps: 4_000,
      }),
      changedSnapshot({ opportunities }),
    );
    expect(bundle.routePlan).toMatchObject({
      retainedAtomic: "60000001",
      legs: [{ inputAtomic: "40000000" }],
    });
  });

  it("derives minimum output from the signed slippage cap", () => {
    const bundle = build(changedPolicy({ maxSlippageBps: 200 }));
    expect(firstAction(bundle)).toMatchObject({ minimumOutputAtomic: "48902000" });
  });

  it("rounds a non-divisible slippage minimum upward to remain authorized", () => {
    const { policy, snapshot } = liveQuoteCase();

    expect(firstAction(build(policy, snapshot))).toMatchObject({
      quotedOutputAtomic: "499528183",
      minimumOutputAtomic: "494532902",
    });
  });

  it("rejects the one-atomic floor mutation for the live-shaped quote", () => {
    const { policy, snapshot } = liveQuoteCase();
    const floorBundle = structuredClone(build(policy, snapshot));
    const action = firstAction(floorBundle);
    if (action?.kind !== "uniswap-v3-exact-input") {
      throw new Error("fixture mismatch");
    }
    action.minimumOutputAtomic = "494532901";

    expect(assessRouteAuthorizationV2(policy, snapshot, floorBundle, {
      expectedAdapterRegistryHash: routeRegistryHash,
    })).toEqual({
      authorizationValid: false,
      errorCodes: ["SLIPPAGE_LIMIT_EXCEEDED"],
    });
  });

  it("breaks equal-value ties by stable opportunity ID", () => {
    const direct = routeSnapshot.opportunities[0];
    if (direct?.kind !== "aave-v3-supply") throw new Error("fixture mismatch");
    const opportunities = [
      direct,
      { ...direct, id: "aave:aaa" },
    ];
    expect(firstAction(build(routePolicy, changedSnapshot({ opportunities })))).toMatchObject({
      opportunityId: "aave:aaa",
    });
  });

  it("rejects a snapshot after its signed freshness window", () => {
    expect(() => build(routePolicy, routeSnapshot, 1_800_000_240)).toThrow("expired");
  });

  it("rejects a snapshot from another adapter registry", () => {
    expect(() => build(routePolicy, routeSnapshot, routeNowSec)).not.toThrow();
    expect(() => buildDeterministicRouteBundleV2(
      { policy: routePolicy, snapshot: routeSnapshot, nowSec: routeNowSec },
      { ...routeBuilderOptions, expectedAdapterRegistryHash: `0x${"ef".repeat(32)}` },
    )).toThrow("registry");
  });

  it("requires every signed adapter scan even for a direct route", () => {
    const opportunities = routeSnapshot.opportunities.filter(
      (opportunity) => opportunity.adapterId === "aave-v3@1",
    );
    const snapshot = changedSnapshot({
      scannedAdapters: ["aave-v3@1"],
      opportunities,
    });
    expect(() => build(routePolicy, snapshot)).toThrow("scan");
  });

  it("refuses to bind a snapshot from another request", () => {
    expect(() => build(routePolicy, changedSnapshot({
      requestId: "550e8400-e29b-41d4-a716-446655440099",
    }))).toThrow("request");
  });

  it("signs the canonical V2 bundle with the configured solver", async () => {
    const solver = createDeterministicRouteSolverV2({
      solverId: "determinist-v2",
      account: routeSolverAccount,
      expectedAdapterRegistryHash: routeRegistryHash,
    });
    const bundle = await solver.solve({
      policy: routePolicy,
      snapshot: routeSnapshot,
      nowSec: routeNowSec,
    });
    const { signature, ...unsigned } = bundle;
    const recovered = await recoverMessageAddress({
      message: { raw: commitment(unsigned) },
      signature,
    });

    expect(isAddressEqual(recovered, routeSolverAccount.address)).toBe(true);
    expect(bundle.estimatedPreGasApyBps).toBe(377);
  });
});
