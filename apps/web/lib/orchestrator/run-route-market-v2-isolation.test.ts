import type { RouteSolverV2 } from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { registryHash } from "../adapters/registry";
import { runRouteMarketV2 } from "./run-route-market-v2";
import {
  healthyRouteSolver,
  routeAccount,
  routeMarketFixtures,
  routeNowSec,
} from "./run-route-market-v2.test-fixture";

function dependencies(
  solvers: readonly RouteSolverV2[],
  saveQuote: Parameters<typeof runRouteMarketV2>[1]["saveQuote"] = async () => undefined,
) {
  const { snapshot } = routeMarketFixtures();
  return {
    snapshot,
    market: {
      captureSnapshot: async () => snapshot,
      solvers,
      saveSnapshot: async () => undefined,
      saveQuote,
      finish: async () => undefined,
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    },
  };
}

describe("runRouteMarketV2 solver isolation", () => {
  it("rejects duplicate configured solver ids before capturing a snapshot", async () => {
    const solver = healthyRouteSolver();
    let captures = 0;
    const { policy, snapshot } = routeMarketFixtures();

    await expect(runRouteMarketV2(policy, {
      captureSnapshot: async () => { captures += 1; return snapshot; },
      solvers: [solver, { ...solver }],
      saveSnapshot: async () => undefined,
      saveQuote: async () => undefined,
      finish: async () => undefined,
      expectedAdapterRegistryHash: registryHash,
      nowSec: () => routeNowSec,
      quotePriceAtomic: "100000",
    })).rejects.toThrow("unique");
    expect(captures).toBe(0);
  });

  it("does not publish a bundle that reports another solver id", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const base = healthyRouteSolver();
    const spoofed: RouteSolverV2 = {
      id: "configured-id",
      address: base.address,
      async solve(input) {
        return { ...await base.solve(input), solverId: "spoofed-id" };
      },
    };

    const result = await runRouteMarketV2(policy, {
      ...dependencies([spoofed]).market,
      captureSnapshot: async () => snapshot,
    });

    expect(result.quotes).toEqual([]);
    expect(result.failures).toEqual([{
      solverId: "configured-id",
      message: "Solver returned another identity",
    }]);
  });

  it("keeps a healthy result when another solver returns malformed data", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const malformed: RouteSolverV2 = {
      id: "malformed",
      address: routeAccount.address,
      solve: async () => ({}) as never,
    };

    const result = await runRouteMarketV2(policy, {
      ...dependencies([malformed, healthyRouteSolver()]).market,
      captureSnapshot: async () => snapshot,
    });

    expect(result.quotes.map(({ solverId }) => solverId)).toEqual([
      "deterministic-v2",
    ]);
    expect(result.failures[0]).toMatchObject({ solverId: "malformed" });
  });

  it("keeps a healthy result when another solver throws before returning a promise", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const synchronousFailure: RouteSolverV2 = {
      id: "sync-failure",
      address: routeAccount.address,
      solve() {
        throw new Error("synchronous solver failure");
      },
    };

    const result = await runRouteMarketV2(policy, {
      ...dependencies([synchronousFailure, healthyRouteSolver()]).market,
      captureSnapshot: async () => snapshot,
    });

    expect(result.quotes.map(({ solverId }) => solverId)).toEqual([
      "deterministic-v2",
    ]);
    expect(result.failures).toContainEqual({
      solverId: "sync-failure",
      message: "synchronous solver failure",
    });
  });

  it("freezes one canonical policy before sharing it with concurrent solvers", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    let policyWasFrozen = false;
    let healthyThreshold = -1;
    const mutator: RouteSolverV2 = {
      id: "mutator",
      address: routeAccount.address,
      async solve(input) {
        policyWasFrozen = Object.isFrozen(input.policy) &&
          Object.isFrozen(input.policy.allowedAdapters);
        if (!policyWasFrozen) input.policy.minPreGasApyBps = 9_999;
        return healthyRouteSolver().solve(input);
      },
    };
    const observer: RouteSolverV2 = {
      ...healthyRouteSolver(),
      async solve(input) {
        healthyThreshold = input.policy.minPreGasApyBps;
        return healthyRouteSolver().solve(input);
      },
    };

    const result = await runRouteMarketV2(policy, {
      ...dependencies([mutator, observer]).market,
      captureSnapshot: async () => snapshot,
    });

    expect(policyWasFrozen).toBe(true);
    expect(healthyThreshold).toBe(0);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.solverId).toBe("deterministic-v2");
    expect(result.failures[0]?.solverId).toBe("mutator");
    expect(policy.minPreGasApyBps).toBe(0);
  });

  it("does not publish or monetize an authorized retain-all result", async () => {
    const { policy, snapshot } = routeMarketFixtures();
    const emptySnapshot = { ...snapshot, opportunities: [] };
    let saved = 0;
    let finished = "";

    const result = await runRouteMarketV2(policy, {
      ...dependencies([healthyRouteSolver()]).market,
      captureSnapshot: async () => emptySnapshot,
      saveQuote: async () => { saved += 1; },
      finish: async (state) => { finished = state; },
    });

    expect(saved).toBe(0);
    expect(finished).toBe("failed");
    expect(result.quotes).toEqual([]);
    expect(result.failures).toEqual([{
      solverId: "deterministic-v2",
      message: "Solver returned no actionable route",
    }]);
  });
});
