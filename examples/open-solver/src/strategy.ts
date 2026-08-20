import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";

/** Replace this function with a deterministic searcher or an isolated coding-agent adapter. */
export async function solve(_intent: SolverIntentV1): Promise<SolverDecisionV1> {
  return { version: 1, decision: "abstain", reasonCode: "NO_LOCAL_STRATEGY" };
}
