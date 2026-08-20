import { TransactionProgramV1Schema } from "@cobia/domain";
import { z } from "zod";
import { CapabilityProgramEvidenceV2Schema } from "../capabilities/evidence-v2";
import { CapabilityProgramV2Schema } from "../capabilities/program-v2";
import { TransactionProgramEvidenceV1Schema } from "./evidence";
import { ProviderArtifactsV1Schema } from "./provider-artifacts";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const AbstentionSchema = z.object({
  version: z.literal(1),
  decision: z.literal("abstain"),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
}).strict();

export const SolverProvenanceV1Schema = z.object({
  version: z.literal(1),
  runner: z.string().trim().min(1).max(128),
  dependencies: z.array(z.object({
    name: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
  }).strict()).max(256),
  sources: z.array(z.object({ url: z.string().url(), sha256: HashSchema }).strict()).max(128),
  commandHashes: z.array(HashSchema).max(256),
  generatedFiles: z.array(z.object({
    path: z.string().min(1).max(256), sha256: HashSchema,
  }).strict()).max(128),
}).strict();

const CapabilityProposalSchema = z.object({
  version: z.literal(1),
  decision: z.literal("submit"),
  proposalKind: z.literal("capability-v2"),
  program: CapabilityProgramV2Schema,
  evidence: CapabilityProgramEvidenceV2Schema,
  provenance: SolverProvenanceV1Schema,
}).strict();

const TransactionProposalSchema = z.object({
  version: z.literal(1),
  decision: z.literal("submit"),
  proposalKind: z.literal("transaction-program"),
  program: TransactionProgramV1Schema,
  evidence: TransactionProgramEvidenceV1Schema,
  providerArtifacts: ProviderArtifactsV1Schema,
  provenance: SolverProvenanceV1Schema,
}).strict();

export const SolverDecisionV1Schema = z.union([
  AbstentionSchema,
  CapabilityProposalSchema,
  TransactionProposalSchema,
]);
export type SolverDecisionV1 = z.infer<typeof SolverDecisionV1Schema>;
