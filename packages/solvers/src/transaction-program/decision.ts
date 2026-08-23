import {
  AssetIdentityEvidenceV1Schema,
  AssetValuationEvidenceV1Schema,
  GeneralAssetProgramV1Schema,
  TransactionProgramV1Schema,
  commitment,
} from "@cobia/domain";
import { z } from "zod";
import { CapabilityProgramEvidenceV2Schema } from "../capabilities/evidence-v2";
import { CapabilityProgramV2Schema } from "../capabilities/program-v2";
import { RegisteredAdapterManifestV1Schema } from "../general-assets/adapter-manifest";
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

export const GeneralAssetEvidenceArtifactV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-asset-evidence"),
  identities: z.array(AssetIdentityEvidenceV1Schema).min(1).max(16),
  valuations: z.array(AssetValuationEvidenceV1Schema).min(1).max(16),
  manifest: RegisteredAdapterManifestV1Schema,
}).strict();
export type GeneralAssetEvidenceArtifactV1 = z.infer<typeof GeneralAssetEvidenceArtifactV1Schema>;

function sameHashSet(left: readonly string[], right: readonly string[]): boolean {
  const expected = [...right].sort();
  return left.length === expected.length && [...left].sort().every((value, index) =>
    value === expected[index]);
}

const GeneralAssetProposalSchema = z.object({
  version: z.literal(1),
  decision: z.literal("submit"),
  proposalKind: z.literal("general-asset-program"),
  program: GeneralAssetProgramV1Schema,
  evidence: GeneralAssetEvidenceArtifactV1Schema,
  provenance: SolverProvenanceV1Schema,
}).strict().superRefine(({ program, evidence }, context) => {
  const identities = evidence.identities.map((value) => commitment(value));
  const valuations = evidence.valuations.map((value) => commitment(value));
  if (program.manifestHash !== commitment(evidence.manifest)) {
    context.addIssue({ code: "custom", path: ["evidence", "manifest"],
      message: "Evidence manifest does not match the program" });
  }
  if (!sameHashSet(program.identityEvidenceHashes, identities) ||
      !sameHashSet(program.valuationEvidenceHashes, valuations)) {
    context.addIssue({ code: "custom", path: ["evidence"],
      message: "Program evidence commitments are incomplete" });
  }
});

export const SolverDecisionV1Schema = z.union([
  AbstentionSchema,
  CapabilityProposalSchema,
  TransactionProposalSchema,
  GeneralAssetProposalSchema,
]);
export type SolverDecisionV1 = z.infer<typeof SolverDecisionV1Schema>;
