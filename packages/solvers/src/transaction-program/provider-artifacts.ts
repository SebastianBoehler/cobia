import { commitment } from "@cobia/domain";
import { type Hash } from "viem";
import { z } from "zod";

const StageIdSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(96);
const ProviderSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*@[1-9][0-9]*$/).max(96);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);

export const ProviderArtifactV1Schema = z.object({
  stageId: StageIdSchema,
  provider: ProviderSchema,
  payloadHash: HashSchema,
  payload: z.unknown(),
}).strict().superRefine((artifact, context) => {
  if (commitment(artifact.payload) !== artifact.payloadHash) {
    context.addIssue({ code: "custom", path: ["payloadHash"], message: "Provider payload hash mismatch" });
  }
});

export const ProviderArtifactsV1Schema = z.object({
  version: z.literal(1),
  artifacts: z.array(ProviderArtifactV1Schema).max(16),
}).strict().superRefine((value, context) => {
  const ids = value.artifacts.map(({ stageId }) => stageId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["artifacts"], message: "Provider stage artifacts must be unique" });
  }
});

export type ProviderArtifactV1 = z.infer<typeof ProviderArtifactV1Schema>;
