import type { LocalAccount } from "viem";
import type {
  DeterministicRouteSolverOptionsV2,
  RouteCandidateSummaryV2,
  RouteSolverInputV2,
  RouteSolverV2,
} from "./routing-v2";
import {
  buildSelectedRouteBundleV2,
  listRouteCandidateSummariesV2,
} from "./routing-v2";
import { signRouteBundleV2 } from "./sign";

export interface AgenticRouteAdviceV2 {
  candidateId: string;
  rationale: string;
}

export interface AgenticRouteAdvisorV2 {
  choose(input: {
    policy: RouteSolverInputV2["policy"];
    candidates: readonly RouteCandidateSummaryV2[];
  }): Promise<AgenticRouteAdviceV2>;
}

export interface AgenticRouteSolverOptionsV2
  extends Omit<DeterministicRouteSolverOptionsV2, "account"> {
  account: LocalAccount;
  advisor: AgenticRouteAdvisorV2;
}

export function createAgenticRouteSolverV2(
  options: AgenticRouteSolverOptionsV2,
): RouteSolverV2 {
  return {
    id: options.solverId,
    address: options.account.address,
    solve: async (input) => {
      const candidates = listRouteCandidateSummariesV2(input);
      if (candidates.length === 0) {
        throw new Error("No actionable route candidates are available");
      }
      const advice = await options.advisor.choose({
        policy: input.policy,
        candidates,
      });
      return signRouteBundleV2(
        buildSelectedRouteBundleV2(input, {
          solverId: options.solverId,
          solverAddress: options.account.address,
          expectedAdapterRegistryHash: options.expectedAdapterRegistryHash,
        }, advice.candidateId),
        options.account,
      );
    },
  };
}
