import type { RouteBundleV2, RoutePlanV2, RouteSnapshotV2 } from "@cobia/domain";
import {
  commitment,
  estimateRouteEconomicsV2,
} from "@cobia/domain";
import { signRouteBundleV2, type RouteSolverV2 } from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { registryHash } from "../adapters/registry";
import { runRouteMarketV2 } from "./run-route-market-v2";
import {
  healthyRouteSolver,
  routeAccount,
  routeMarketFixtures,
  routeNowSec,
  secondRouteAccount,
} from "./run-route-market-v2.test-fixture";

describe("runRouteMarketV2", () => {
  it("captures once and publishes only an independently authorized quote", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const events: string[] = [];
    const stored: RouteBundleV2[] = [];

    const result = await runRouteMarketV2(policy, {
      captureSnapshot: async () => { events.push("capture"); return snapshot; },
      solvers: [healthyRouteSolver()],
      saveSnapshot: async () => { events.push("save-snapshot"); },
      saveQuote: async (bundle, verdict) => {
        events.push(`save-quote:${verdict.routeAuthorized}`);
        stored.push(bundle);
      },
      finish: async (state) => { events.push(`finish:${state}`); },
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    });

    expect(events).toEqual([
      "capture",
      "save-snapshot",
      "save-quote:true",
      "finish:quotes_ready",
    ]);
    expect(stored).toHaveLength(1);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.authorization).toEqual({ routeAuthorized: true, errorCodes: [] });
    expect(JSON.stringify(result.quotes[0])).not.toContain("routePlan");
  });

  it("keeps a failed solver explicit without inventing a second quote", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const failed: RouteSolverV2 = {
      id: "failed",
      address: routeAccount.address,
      solve: async () => { throw new Error("solver unavailable"); },
    };
    let finished = "";

    const result = await runRouteMarketV2(policy, {
      captureSnapshot: async () => snapshot,
      solvers: [healthyRouteSolver(), failed],
      saveSnapshot: async () => undefined,
      saveQuote: async () => undefined,
      finish: async (state) => { finished = state; },
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    });

    expect(finished).toBe("partial");
    expect(result.quotes).toHaveLength(1);
    expect(result.failures).toEqual([{ solverId: "failed", message: "solver unavailable" }]);
  });

  it("stores but does not publish a solver artifact rejected by verification", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const base = healthyRouteSolver();
    const invalid: RouteSolverV2 = {
      ...base,
      async solve(input) {
        expect(Object.isFrozen(input.snapshot)).toBe(true);
        expect(Object.isFrozen(input.snapshot.opportunities[0])).toBe(true);
        return {
          ...await base.solve(input),
          signature: `0x${"aa".repeat(65)}`,
        };
      },
    };
    let storedAuthorized: boolean | undefined;

    const result = await runRouteMarketV2(policy, {
      captureSnapshot: async () => snapshot,
      solvers: [invalid],
      saveSnapshot: async () => undefined,
      saveQuote: async (_bundle, verdict) => {
        storedAuthorized = verdict.routeAuthorized;
      },
      finish: async () => undefined,
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    });

    expect(storedAuthorized).toBe(false);
    expect(result.quotes).toEqual([]);
    expect(result.failures[0]).toMatchObject({ solverId: "deterministic-v2" });
    expect(result.failures[0]?.message).toContain("SOLVER_SIGNATURE_INVALID");
  });

  it("rechecks wall-clock freshness after a solver returns", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const base = healthyRouteSolver();
    let clock = routeNowSec;
    const delayed: RouteSolverV2 = {
      ...base,
      async solve(input) {
        const bundle = await base.solve(input);
        clock += policy.maxSnapshotAgeSec + 1;
        return bundle;
      },
    };

    const result = await runRouteMarketV2(policy, {
      captureSnapshot: async () => snapshot,
      solvers: [delayed],
      saveSnapshot: async () => undefined,
      saveQuote: async () => undefined,
      finish: async () => undefined,
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => clock,
      quotePriceAtomic: "100000",
    });

    expect(result.quotes).toEqual([]);
    expect(result.failures[0]?.message).toContain("SNAPSHOT_EXPIRED");
  });

  it("ranks equal displayed APY by exact gain before solver id", async () => {
    const { policy, snapshot: baseSnapshot } = routeMarketFixtures();
    const inputOpportunity = baseSnapshot.opportunities.find(
      (opportunity) => opportunity.kind === "aave-v3-supply" &&
        opportunity.asset === policy.asset,
    );
    if (!inputOpportunity || inputOpportunity.kind !== "aave-v3-supply") {
      throw new Error("Aave input fixture is missing");
    }
    const snapshot: RouteSnapshotV2 = {
      ...baseSnapshot,
      opportunities: [
        { ...inputOpportunity, id: "aave:lower", supplyRateBps: 500 },
        { ...inputOpportunity, id: "aave:higher", supplyRateBps: 501 },
      ],
    };
    const solver = (
      id: string,
      opportunityId: string,
      signer: typeof routeAccount,
    ): RouteSolverV2 => ({
      id,
      address: signer.address,
      async solve() {
        const routePlan: RoutePlanV2 = {
          version: 2,
          inputAsset: policy.asset,
          inputAtomic: policy.principalAtomic,
          retainedAtomic: "50000000",
          horizonDays: policy.horizonDays,
          legs: [{
            id: opportunityId,
            inputAtomic: "50000000",
            actions: [{
              kind: "aave-v3-supply",
              opportunityId,
              consume: "all",
              asset: policy.asset,
            }],
          }],
        };
        return signRouteBundleV2({
          version: 2,
          requestId: policy.requestId,
          solverId: id,
          solverAddress: signer.address,
          policyHash: commitment(policy),
          snapshotHash: commitment(snapshot),
          routePlan,
          evidence: [],
          riskFlags: [],
          estimatedPreGasApyBps: estimateRouteEconomicsV2(
            policy,
            snapshot,
            routePlan,
          ).estimatedPreGasApyBps,
          validUntil: routeNowSec + policy.maxSnapshotAgeSec,
        }, signer);
      },
    });

    const result = await runRouteMarketV2(policy, {
      captureSnapshot: async () => snapshot,
      solvers: [
        solver("aaa-lower", "aave:lower", routeAccount),
        solver("zzz-higher", "aave:higher", secondRouteAccount),
      ],
      saveSnapshot: async () => undefined,
      saveQuote: async () => undefined,
      finish: async () => undefined,
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    });

    expect(result.quotes.map(({ solverId }) => solverId)).toEqual([
      "zzz-higher",
      "aaa-lower",
    ]);
    expect(result.quotes.map(({ estimatedPreGasApyBps }) => estimatedPreGasApyBps))
      .toEqual([250, 250]);
  });
});
