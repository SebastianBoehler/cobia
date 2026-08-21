import { commitment } from "@cobia/domain";
import { SolverDecisionV1Schema } from "@cobia/solver-sdk";

export function canonicalDecisionCommitment(input: unknown) {
  const decision = SolverDecisionV1Schema.parse(input);
  return { decision, decisionHash: commitment(decision) };
}
