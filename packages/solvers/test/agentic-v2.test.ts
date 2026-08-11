import { commitment } from "@cobia/domain";
import { isAddressEqual, recoverMessageAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  createAgenticRouteSolverV2,
  type AgenticRouteAdvisorV2,
} from "../src/index";
import {
  routeNowSec,
  routePolicy,
  routeRegistryHash,
  routeSnapshot,
  routeSolverAccount,
} from "./routing-v2-fixtures";

const input = {
  policy: routePolicy,
  snapshot: routeSnapshot,
  nowSec: routeNowSec,
};

describe("agentic V2 route solver", () => {
  it("lets the advisor choose only among server-built route candidates", async () => {
    const choose = vi.fn(async (
      { candidates }: Parameters<AgenticRouteAdvisorV2["choose"]>[0],
    ) => ({
      candidateId: candidates.find(({ id }) => id.startsWith("direct:"))!.id,
      rationale: "Prefer the direct route because it avoids swap execution risk.",
    }));
    const solver = createAgenticRouteSolverV2({
      solverId: "agentic-v2",
      account: routeSolverAccount,
      expectedAdapterRegistryHash: routeRegistryHash,
      advisor: { choose },
    });

    const bundle = await solver.solve(input);
    const advisorInput = choose.mock.calls[0]![0];

    expect(advisorInput.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "direct:aave:input",
        estimatedPreGasApyBps: 250,
        actions: ["aave-v3-supply"],
      }),
      expect.objectContaining({
        id: "swap:swap:input-output:50000000:aave:output",
        estimatedPreGasApyBps: 377,
        actions: ["uniswap-v3-exact-input", "aave-v3-supply"],
      }),
    ]));
    for (const candidate of advisorInput.candidates) {
      expect(candidate).not.toHaveProperty("routePlan");
    }
    expect(bundle).toMatchObject({
      solverId: "agentic-v2",
      estimatedPreGasApyBps: 250,
      routePlan: {
        retainedAtomic: "50000000",
        legs: [{
          inputAtomic: "50000000",
          actions: [{
            kind: "aave-v3-supply",
            opportunityId: "aave:input",
          }],
        }],
      },
    });
    expect(isAddressEqual(bundle.solverAddress, routeSolverAccount.address)).toBe(true);
    const { signature, ...unsigned } = bundle;
    const recovered = await recoverMessageAddress({
      message: { raw: commitment(unsigned) },
      signature,
    });
    expect(isAddressEqual(recovered, routeSolverAccount.address)).toBe(true);
  });

  it("rejects an invented candidate before producing a bundle", async () => {
    const solver = createAgenticRouteSolverV2({
      solverId: "agentic-v2",
      account: routeSolverAccount,
      expectedAdapterRegistryHash: routeRegistryHash,
      advisor: {
        choose: vi.fn(async () => ({
          candidateId: "swap:invented-token:fake-pool",
          rationale: "Invent a better route.",
        })),
      },
    });

    await expect(solver.solve(input)).rejects.toThrow("unknown route candidate");
  });
});
