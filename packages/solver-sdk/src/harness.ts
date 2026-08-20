import { commitment } from "@cobia/domain";
import { SolverDecisionV1Schema, type SolverDecisionV1 } from "@cobia/solvers";
import type { SolverIntentListV1, SolverIntentV1 } from "./client";

export { SolverDecisionV1Schema, type SolverDecisionV1 };

interface IntentClientV1 {
  listIntents(): Promise<SolverIntentListV1>;
}

export async function runSolverCycle(input: {
  client: IntentClientV1;
  solve(intent: SolverIntentV1): Promise<unknown>;
}) {
  const { intents } = await input.client.listIntents();
  return Promise.all(intents.map(async (intent) => {
    const decision = SolverDecisionV1Schema.parse(await input.solve(intent));
    if (decision.decision === "submit") {
      if (decision.program.requestId !== intent.id ||
          decision.program.owner !== intent.policy.owner ||
          decision.evidence.programHash !== commitment(decision.program) ||
          (decision.proposalKind === "transaction-program" &&
            decision.program.policyHash !== intent.policyHash)) {
        throw new Error(`Solver proposal for ${intent.id} does not match signed intent authority`);
      }
    }
    return { intentId: intent.id, decision };
  }));
}
