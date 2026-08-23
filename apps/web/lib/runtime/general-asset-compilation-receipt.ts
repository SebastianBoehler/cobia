import { commitment } from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema } from "@cobia/solvers";
import { z } from "zod";

export class GeneralAssetRefreshRequiredError extends Error {}

const GeneralAssetCompilationReceiptV1Schema = z.object({
  status: z.literal("review"),
  compilationLeaseId: z.string().uuid(),
  evidenceExpiresAtSec: z.number().int().positive().safe(),
  generalAssetEvidence: GeneralAssetEvidenceArtifactV1Schema,
  values: z.object({
    kind: z.literal("general-asset-draft"),
    evidenceExpiresAtSec: z.number().int().positive().safe(),
  }).passthrough(),
}).passthrough();

export function parseGeneralAssetCompilationReceiptV1(raw: unknown, expectedLeaseId: string) {
  const parsed = GeneralAssetCompilationReceiptV1Schema.safeParse(raw);
  if (!parsed.success || parsed.data.compilationLeaseId !== expectedLeaseId ||
      parsed.data.evidenceExpiresAtSec !== parsed.data.values.evidenceExpiresAtSec) {
    throw new GeneralAssetRefreshRequiredError(
      "General asset compilation receipt changed; refresh before signing",
    );
  }
  return { evidence: parsed.data.generalAssetEvidence,
    evidenceHash: commitment(parsed.data.generalAssetEvidence),
    evidenceExpiresAtSec: parsed.data.evidenceExpiresAtSec };
}
