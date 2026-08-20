import { TransactionProgramV1Schema, commitment } from "@cobia/domain";
import { ProviderArtifactsV1Schema, TransactionProgramEvidenceV1Schema } from "@cobia/solvers";
import { z } from "zod";
import type { SolverIntentListV1, SolverIntentV1 } from "./client";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const AbstentionSchema = z.object({
  version: z.literal(1),
  decision: z.literal("abstain"),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
}).strict();

const ProvenanceSchema = z.object({
  version: z.literal(1),
  runner: z.string().trim().min(1).max(128),
  dependencies: z.array(z.object({
    name: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
  }).strict()).max(256),
  sources: z.array(z.object({ url: z.string().url(), sha256: HashSchema }).strict()).max(128),
  commandHashes: z.array(HashSchema).max(256),
  generatedFiles: z.array(z.object({ path: z.string().min(1).max(256), sha256: HashSchema }).strict()).max(128),
}).strict();

const ProposalSchema = z.object({
  version: z.literal(1),
  decision: z.literal("submit"),
  program: TransactionProgramV1Schema,
  evidence: TransactionProgramEvidenceV1Schema,
  providerArtifacts: ProviderArtifactsV1Schema,
  provenance: ProvenanceSchema,
}).strict();

export const SolverDecisionV1Schema = z.discriminatedUnion("decision", [
  AbstentionSchema,
  ProposalSchema,
]);
export type SolverDecisionV1 = z.infer<typeof SolverDecisionV1Schema>;

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
          decision.program.policyHash !== intent.policyHash ||
          decision.program.owner !== intent.policy.owner ||
          decision.evidence.programHash !== commitment(decision.program)) {
        throw new Error(`Solver proposal for ${intent.id} does not match signed intent authority`);
      }
    }
    return { intentId: intent.id, decision };
  }));
}
