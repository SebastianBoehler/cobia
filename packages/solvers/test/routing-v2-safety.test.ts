import type { RouteSnapshotV2 } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeterministicRouteBundleV2,
  signRouteBundleV2,
} from "../src/index";
import {
  routeBuilderOptions,
  routeInputAsset,
  routeNowSec,
  routeOutputAsset,
  routePolicy,
  routeSolverAccount,
  routeSnapshot,
} from "./routing-v2-fixtures";

function build(snapshot: RouteSnapshotV2 = routeSnapshot) {
  return buildDeterministicRouteBundleV2(
    { policy: routePolicy, snapshot, nowSec: routeNowSec },
    routeBuilderOptions,
  );
}

describe("deterministic V2 route safety", () => {
  it("returns no-action for an empty scan without valuations", () => {
    const bundle = build({
      ...routeSnapshot,
      valuations: [],
      opportunities: [],
    });

    expect(bundle).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: { retainedAtomic: "100000000", legs: [] },
    });
  });

  it("returns no-action when only unrelated opportunities are valued", () => {
    const valuations = routeSnapshot.valuations.filter(
      ({ asset }) => asset === routeOutputAsset,
    );
    const opportunities = routeSnapshot.opportunities.filter(
      (opportunity) =>
        opportunity.kind === "aave-v3-supply" &&
        opportunity.asset === routeOutputAsset,
    );
    const bundle = build({ ...routeSnapshot, valuations, opportunities });

    expect(bundle).toMatchObject({
      estimatedPreGasApyBps: 0,
      routePlan: { retainedAtomic: "100000000", legs: [] },
    });
  });

  it("rejects a snapshot captured after the solver clock", () => {
    const capturedAt = new Date((routeNowSec + 1) * 1_000).toISOString();
    expect(() => build({ ...routeSnapshot, capturedAt })).toThrow("future");
  });

  it("accepts a snapshot captured exactly at the solver clock", () => {
    const capturedAt = new Date(routeNowSec * 1_000).toISOString();
    expect(() => build({ ...routeSnapshot, capturedAt })).not.toThrow();
  });

  it("rejects a solver-address mismatch before invoking the signer", async () => {
    const signMessage = vi.spyOn(routeSolverAccount, "signMessage");
    let rejection: unknown;
    try {
      try {
        await signRouteBundleV2(
          { ...build(), solverAddress: routeInputAsset },
          routeSolverAccount,
        );
      } catch (error) {
        rejection = error;
      }

      expect(signMessage).not.toHaveBeenCalled();
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toMatch(/solver/i);
    } finally {
      signMessage.mockRestore();
    }
  });
});
