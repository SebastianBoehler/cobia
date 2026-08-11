import { describe, expect, it } from "vitest";
import {
  assertVerifiedRouteVerdictV2,
  commitment,
  projectRouteQuoteV2,
  verifyRouteBundleV2,
} from "../src/index";
import {
  assessmentContextV2,
  policyV2,
  routePlanV2,
  snapshotV2,
} from "./routing-v2-fixtures";
import {
  signedRouteBundleV2,
  verifierCapturedAtSec,
  verifierCutoffSec,
  verifierSolver,
} from "./routing-v2-verifier-fixtures";

describe("V2 verifier security boundaries", () => {
  it("rejects a non-positive action route when the signed minimum is zero", async () => {
    const policy = { ...policyV2, minPreGasApyBps: 0 };
    const opportunities = snapshotV2.opportunities.map((opportunity) => {
      if (opportunity.kind === "uniswap-v3-exact-input") {
        return { ...opportunity, quotedOutputAtomic: "10000000" };
      }
      return opportunity.asset === policy.asset
        ? opportunity
        : { ...opportunity, validatedSupplyAtomic: "10000000" };
    });
    const snapshot = { ...snapshotV2, opportunities };
    const leg = routePlanV2.legs[0];
    const routePlan = {
      ...routePlanV2,
      legs: [{
        ...leg,
        actions: [{
          ...leg.actions[0],
          quotedOutputAtomic: "10000000",
          minimumOutputAtomic: "9900000",
        }, leg.actions[1]],
      }],
    } as typeof routePlanV2;
    const bundle = await signedRouteBundleV2({
      policyHash: commitment(policy),
      snapshotHash: commitment(snapshot),
      routePlan,
      estimatedPreGasApyBps: 0,
    });

    const verdict = await verifyRouteBundleV2(
      policy,
      snapshot,
      bundle,
      verifierSolver.address,
      assessmentContextV2,
      verifierCapturedAtSec + 1,
    );
    expect(verdict.errorCodes).toContain("PRE_GAS_GAIN_NOT_POSITIVE");
    expect(verdict.routeAuthorized).toBe(false);
  });

  it("rejects a snapshot captured 500ms after the solver clock", async () => {
    const snapshot = {
      ...snapshotV2,
      capturedAt: new Date(verifierCapturedAtSec * 1_000 + 500).toISOString(),
    };
    const bundle = await signedRouteBundleV2({
      snapshotHash: commitment(snapshot),
    });
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshot,
      bundle,
      verifierSolver.address,
      assessmentContextV2,
      verifierCapturedAtSec,
    );

    expect(verdict.errorCodes).toContain("SNAPSHOT_FROM_FUTURE");
  });

  it("rejects matching-APY fabricated and cloned verdicts", async () => {
    const bundle = await signedRouteBundleV2();
    const fabricated = {
      bundleHash: commitment(bundle),
      routeAuthorized: true,
      errorCodes: [],
      recomputedPreGasApyBps: bundle.estimatedPreGasApyBps,
    } as const;
    expect(() => assertVerifiedRouteVerdictV2(bundle, fabricated)).toThrow(
      "not produced by verifyRouteBundleV2",
    );
    expect(() => projectRouteQuoteV2(
      bundle,
      fabricated,
      "100000",
      verifierCutoffSec,
    )).toThrow("not produced by verifyRouteBundleV2");

    const verified = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      bundle,
      verifierSolver.address,
      assessmentContextV2,
      verifierCapturedAtSec + 1,
    );
    const cloned = structuredClone(verified);
    expect(() => assertVerifiedRouteVerdictV2(bundle, cloned)).toThrow(
      "not produced by verifyRouteBundleV2",
    );
  });

  it("freezes branded verdicts against mutation", async () => {
    const bundle = await signedRouteBundleV2();
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      bundle,
      verifierSolver.address,
      assessmentContextV2,
      verifierCapturedAtSec + 1,
    );

    expect(Object.isFrozen(verdict)).toBe(true);
    expect(Object.isFrozen(verdict.errorCodes)).toBe(true);
    expect(() => (
      verdict.errorCodes as (typeof verdict.errorCodes)[number][]
    ).push("ECONOMICS_INVALID")).toThrow();
    expect(() => assertVerifiedRouteVerdictV2(bundle, verdict)).not.toThrow();
  });

  it("projects the canonical bundle hash from a branded verdict", async () => {
    const signed = await signedRouteBundleV2();
    const bundle = { ...signed, solverAddress: verifierSolver.address };
    expect(bundle.solverAddress).not.toBe(bundle.solverAddress.toLowerCase());
    const verdict = await verifyRouteBundleV2(
      policyV2,
      snapshotV2,
      bundle,
      verifierSolver.address,
      assessmentContextV2,
      verifierCapturedAtSec + 1,
    );

    expect(verdict.routeAuthorized).toBe(true);
    expect(projectRouteQuoteV2(
      bundle,
      verdict,
      "100000",
      verifierCutoffSec,
    )).toMatchObject({
      bundleHash: verdict.bundleHash,
      quoteId: verdict.bundleHash,
      solverAddress: verifierSolver.address.toLowerCase(),
    });
  });
});
