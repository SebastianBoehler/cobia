import { describe, expect, it } from "vitest";
import {
  compareRouteEconomicsV2,
  commitment,
  estimateRouteEconomicsV2,
  projectRouteQuoteV2,
  verifyRouteBundleV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
} from "../src/index";
import {
  assessmentContextV2,
  bundleV2,
  policyV2,
  routePlanV2,
  snapshotV2,
} from "./routing-v2-fixtures";
import {
  otherVerifierSolver as otherSolver,
  signedRouteBundleV2 as signedBundle,
  verifierCapturedAtSec as capturedAtSec,
  verifierCutoffSec as cutoffSec,
  verifierSolver as solver,
} from "./routing-v2-verifier-fixtures";

describe("V2 route economics", () => {
  it("recomputes annualized pre-gas APY from signed valuations and opportunities", () => {
    expect(estimateRouteEconomicsV2(policyV2, snapshotV2, routePlanV2)).toEqual({
      estimatedPreGasApyBps: 23,
      positiveGain: true,
    });
  });

  it("returns a zero baseline without requiring a valuation", () => {
    const snapshot: RouteSnapshotV2 = {
      ...snapshotV2,
      valuations: [snapshotV2.valuations[1]],
      opportunities: [],
    };
    expect(estimateRouteEconomicsV2(policyV2, snapshot, {
      ...routePlanV2,
      retainedAtomic: policyV2.principalAtomic,
      legs: [],
    })).toEqual({
      estimatedPreGasApyBps: 0,
      positiveGain: false,
    });
  });

  it("does not turn a pre-gas loss into a positive APY", () => {
    const opportunities = snapshotV2.opportunities.map((opportunity) =>
      opportunity.kind === "uniswap-v3-exact-input"
        ? { ...opportunity, quotedOutputAtomic: "10000000" }
        : opportunity,
    );
    const snapshot = { ...snapshotV2, opportunities };
    const plan = {
      ...routePlanV2,
      legs: [{
        ...routePlanV2.legs[0],
        actions: [{
          ...routePlanV2.legs[0]!.actions[0],
          quotedOutputAtomic: "10000000",
          minimumOutputAtomic: "9900000",
        }, routePlanV2.legs[0]!.actions[1]],
      }],
    } as typeof routePlanV2;
    expect(estimateRouteEconomicsV2(policyV2, snapshot, plan)).toEqual({
      estimatedPreGasApyBps: 0,
      positiveGain: false,
    });
  });

  it("compares exact gains before their published APY floors", () => {
    const direct = snapshotV2.opportunities[0];
    if (direct?.kind !== "aave-v3-supply") throw new Error("fixture mismatch");
    const snapshot = {
      ...snapshotV2,
      opportunities: [
        { ...direct, id: "aave:low", supplyRateBps: 500 },
        { ...direct, id: "aave:high", supplyRateBps: 501 },
      ],
    };
    const plan = (opportunityId: string): RoutePlanV2 => ({
      ...routePlanV2,
      legs: [{
        id: "direct-supply",
        inputAtomic: "15000000",
        actions: [{
          kind: "aave-v3-supply",
          opportunityId,
          consume: "all",
          asset: policyV2.asset,
        }],
      }],
    });

    expect(compareRouteEconomicsV2(
      policyV2,
      snapshot,
      plan("aave:high"),
      plan("aave:low"),
    )).toBeLessThan(0);
  });
});

describe("verifyRouteBundleV2", () => {
  it("binds authorization, economics, freshness, and solver signature", async () => {
    const bundle = await signedBundle();

    await expect(verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      bundle,
      solver.address,
      assessmentContextV2,
      capturedAtSec + 1,
    )).resolves.toEqual({
      bundleHash: commitment(bundle),
      routeAuthorized: true,
      errorCodes: [],
      recomputedPreGasApyBps: 23,
    });
  });

  it.each([
    ["economics", { estimatedPreGasApyBps: 24 }, "PRE_GAS_APY_MISMATCH"],
    ["validity", { validUntil: cutoffSec + 1 }, "VALIDITY_EXCEEDS_POLICY"],
  ] as const)("rejects a bundle with mismatched %s", async (_, change, code) => {
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      await signedBundle(change),
      solver.address,
      assessmentContextV2,
      capturedAtSec + 1,
    );
    expect(verdict.routeAuthorized).toBe(false);
    expect(verdict.errorCodes).toContain(code);
  });

  it("rejects a signature from another solver", async () => {
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      await signedBundle({}, otherSolver),
      solver.address,
      assessmentContextV2,
      capturedAtSec + 1,
    );
    expect(verdict.errorCodes).toContain("SOLVER_SIGNATURE_INVALID");
  });

  it("propagates static authorization and the signed yield floor", async () => {
    const wrongRegistry = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      await signedBundle(),
      solver.address,
      { expectedAdapterRegistryHash: `0x${"ef".repeat(32)}` },
      capturedAtSec + 1,
    );
    expect(wrongRegistry.errorCodes).toContain("ADAPTER_REGISTRY_MISMATCH");

    const noAction = await signedBundle({
      routePlan: {
        ...routePlanV2,
        retainedAtomic: policyV2.principalAtomic,
        legs: [],
      },
      estimatedPreGasApyBps: 0,
    });
    const belowFloor = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      noAction,
      solver.address,
      assessmentContextV2,
      capturedAtSec + 1,
    );
    expect(belowFloor.errorCodes).toContain("PRE_GAS_APY_BELOW_MINIMUM");
  });

  it("rejects expired and future-dated snapshots", async () => {
    const expired = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      await signedBundle(),
      solver.address,
      assessmentContextV2,
      cutoffSec,
    );
    expect(expired.errorCodes).toContain("QUOTE_EXPIRED");

    const futureSnapshot = {
      ...snapshotV2,
      capturedAt: new Date((capturedAtSec + 60) * 1_000).toISOString(),
    };
    const futureBundle = await signedBundle({
      snapshotHash: commitment(futureSnapshot),
    });
    const future = await verifyRouteBundleV2(
      policyV2,
      futureSnapshot,
      futureBundle,
      solver.address,
      assessmentContextV2,
      capturedAtSec,
    );
    expect(future.errorCodes).toContain("SNAPSHOT_FROM_FUTURE");
  });

  it("projects only recomputed public fields from the verified bundle", async () => {
    const bundle = await signedBundle();
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      bundle,
      solver.address,
      assessmentContextV2,
      capturedAtSec + 1,
    );

    expect(projectRouteQuoteV2(bundle, verdict, "100000", cutoffSec + 10)).toEqual({
      version: 2,
      quoteId: commitment(bundle),
      requestId: policyV2.requestId,
      solverId: bundle.solverId,
      solverAddress: solver.address.toLowerCase(),
      bundleHash: commitment(bundle),
      estimatedPreGasApyBps: 23,
      riskGrade: "unassessed",
      priceAtomic: "100000",
      validUntil: cutoffSec,
      authorization: { routeAuthorized: true, errorCodes: [] },
    });
  });

});
