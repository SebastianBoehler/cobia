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
  hashV2,
  outputAssetV2,
  policyV2,
  routePlanV2,
  snapshotV2,
} from "./routing-v2-fixtures";

const checksummedUsdt0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const canonicalUsdt0 = checksummedUsdt0.toLowerCase();
const checksummedUsdg = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";
const canonicalUsdg = checksummedUsdg.toLowerCase();

describe("V2 opportunity binding and policy assessment", () => {
  it("commits canonical valuations for every opportunity asset", () => {
    const valuations = [
      { asset: policyV2.asset, decimals: 6, priceUsdE8: "100000000" },
      {
        asset: outputAssetV2,
        decimals: 6,
        priceUsdE8: "100000000",
      },
    ].sort((left, right) => left.asset.localeCompare(right.asset));

    expect(RouteSnapshotV2Schema.safeParse({ ...snapshotV2, valuations }).success)
      .toBe(true);
  });

  it("binds opportunities to an adapter registry and one block", () => {
    expect(RouteSnapshotV2Schema.parse(snapshotV2)).toEqual(snapshotV2);
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        opportunities: [...snapshotV2.opportunities, snapshotV2.opportunities[0]],
      }).success,
    ).toBe(false);
  });

  it("labels the Aave liquidity rate without promising realized APY", () => {
    const opportunity = snapshotV2.opportunities[0];
    expect(opportunity.kind).toBe("aave-v3-supply");
    if (opportunity.kind !== "aave-v3-supply") return;
    const { supplyRateBps, ...rest } = opportunity;
    expect(AaveV3SupplyOpportunityV2Schema.safeParse(opportunity).success).toBe(true);
    expect(
      AaveV3SupplyOpportunityV2Schema.safeParse({
        ...rest,
        supplyApyBps: supplyRateBps,
      }).success,
    ).toBe(false);
  });

  it("accepts an empty completed adapter scan for the no-action baseline", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...snapshotV2,
      scannedAdapters: policyV2.allowedAdapters,
      opportunities: [],
    });
    const bundle = RouteBundleV2Schema.parse({
      ...bundleV2,
      snapshotHash: commitment(snapshot),
      routePlan: {
        ...routePlanV2,
        retainedAtomic: routePlanV2.inputAtomic,
        legs: [],
      },
    });
    expect(
      assessRouteAuthorizationV2(
        policyV2,
        snapshot,
        bundle,
        assessmentContextV2,
      ),
    ).toEqual({ authorizationValid: true, errorCodes: [] });
  });

  it("binds each opportunity kind to its exact adapter", () => {
    const [aave, swap, ...rest] = snapshotV2.opportunities;
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        opportunities: [{ ...aave, adapterId: "uniswap-v3@1" }, swap, ...rest],
      }).success,
    ).toBe(false);
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        opportunities: [aave, { ...swap, adapterId: "aave-v3@1" }, ...rest],
      }).success,
    ).toBe(false);
  });

  it("rejects opportunities from adapters absent from scan coverage", () => {
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        scannedAdapters: ["aave-v3@1"],
      }).success,
    ).toBe(false);
  });

  it("requires canonical completed adapter scan coverage", () => {
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        scannedAdapters: ["aave-v3@1", "aave-v3@1", "uniswap-v3@1"],
      }).success,
    ).toBe(false);
    expect(
      RouteSnapshotV2Schema.safeParse({
        ...snapshotV2,
        scannedAdapters: [...snapshotV2.scannedAdapters].reverse(),
      }).success,
    ).toBe(false);
  });

  it("canonicalizes opportunity addresses", () => {
    const parsed = RouteSnapshotV2Schema.parse({
      ...snapshotV2,
      valuations: [
        { asset: checksummedUsdt0, decimals: 6, priceUsdE8: "100000000" },
        { asset: checksummedUsdg, decimals: 6, priceUsdE8: "100000000" },
      ].sort((left, right) => left.asset.toLowerCase().localeCompare(right.asset.toLowerCase())),
      opportunities: snapshotV2.opportunities.map((opportunity) => {
        if (opportunity.kind === "aave-v3-supply") {
          return opportunity.asset === policyV2.asset
            ? { ...opportunity, asset: checksummedUsdt0 }
            : { ...opportunity, asset: checksummedUsdg };
        }
        return {
          ...opportunity,
          tokenIn: checksummedUsdt0,
          tokenOut: checksummedUsdg,
        };
      }),
    });
    expect(parsed.opportunities[0]).toMatchObject({ asset: canonicalUsdt0 });
    expect(parsed.opportunities[1]).toMatchObject({
      tokenIn: canonicalUsdt0,
      tokenOut: canonicalUsdg,
    });
    expect(parsed.opportunities[2]).toMatchObject({ asset: canonicalUsdg });
  });

  it("rejects snapshots from a registry other than the trusted verifier registry", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...snapshotV2,
      adapterRegistryHash: `0x${"12".repeat(32)}`,
    });
    const bundle = RouteBundleV2Schema.parse({
      ...bundleV2,
      snapshotHash: commitment(snapshot),
    });
    expect(
      assessRouteAuthorizationV2(policyV2, snapshot, bundle, {
        expectedAdapterRegistryHash: hashV2,
      }).errorCodes,
    ).toContain("ADAPTER_REGISTRY_MISMATCH");
  });

  it("rejects snapshots that did not complete every signed adapter scan", () => {
    const snapshot = RouteSnapshotV2Schema.parse({
      ...snapshotV2,
      scannedAdapters: ["aave-v3@1"],
      opportunities: snapshotV2.opportunities.filter(
        (opportunity) => opportunity.adapterId === "aave-v3@1",
      ),
    });
    const bundle = RouteBundleV2Schema.parse({
      ...bundleV2,
      snapshotHash: commitment(snapshot),
      routePlan: {
        ...routePlanV2,
        retainedAtomic: routePlanV2.inputAtomic,
        legs: [],
      },
    });
    expect(
      assessRouteAuthorizationV2(policyV2, snapshot, bundle, {
        expectedAdapterRegistryHash: hashV2,
      }).errorCodes,
    ).toContain("ADAPTER_SCAN_INCOMPLETE");
  });

  it("validates static route authorization without claiming policy economics", () => {
    expect(RouteBundleV2Schema.parse(bundleV2)).toEqual(bundleV2);
    expect(
      assessRouteAuthorizationV2(
        policyV2,
        snapshotV2,
        bundleV2,
        assessmentContextV2,
      ),
    ).toEqual({ authorizationValid: true, errorCodes: [] });
  });

  it("canonicalizes solver addresses in bundles", () => {
    expect(
      RouteBundleV2Schema.parse({ ...bundleV2, solverAddress: checksummedUsdt0 })
        .solverAddress,
    ).toBe(canonicalUsdt0);
  });

  it("rejects an unauthorized swap output", () => {
    const policy = { ...policyV2, allowedOutputAssets: [policyV2.asset] };
    const bundle = { ...bundleV2, policyHash: commitment(policy) };
    expect(
      assessRouteAuthorizationV2(
        policy,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes,
    ).toContain("OUTPUT_ASSET_NOT_ALLOWED");
  });

  it("rejects an opportunity using an unsigned adapter", () => {
    const policy = {
      ...policyV2,
      allowedAdapters: policyV2.allowedAdapters.slice(0, 1),
    };
    const bundle = { ...bundleV2, policyHash: commitment(policy) };
    expect(
      assessRouteAuthorizationV2(
        policy,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes,
    ).toContain("ADAPTER_NOT_ALLOWED");
  });

  it("rejects slippage beyond the signed cap", () => {
    const swapped = routePlanV2.legs[0];
    const routePlan = {
      ...routePlanV2,
      legs: [{
        ...swapped,
        actions: [
          { ...swapped.actions[0], minimumOutputAtomic: "9800000" },
          swapped.actions[1],
        ],
      }],
    };
    const bundle = RouteBundleV2Schema.parse({ ...bundleV2, routePlan });
    expect(
      assessRouteAuthorizationV2(
        policyV2,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes,
    ).toContain("SLIPPAGE_LIMIT_EXCEEDED");
  });

  it("rejects a route evaluated over another horizon", () => {
    const bundle = RouteBundleV2Schema.parse({
      ...bundleV2,
      routePlan: { ...routePlanV2, horizonDays: 31 },
    });
    expect(
      assessRouteAuthorizationV2(
        policyV2,
        snapshotV2,
        bundle,
        assessmentContextV2,
      ).errorCodes,
    ).toContain("HORIZON_MISMATCH");
  });
});
