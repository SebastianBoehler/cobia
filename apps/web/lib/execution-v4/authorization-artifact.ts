import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);

export const GeneralAssetAuthorizationArtifactV4Schema = z.object({
  version: z.literal(4),
  stageIndex: z.number().int().min(0).max(7),
  chainId: z.union([z.literal(1), z.literal(196)]),
  executor: AddressSchema,
  executionCommitment: HashSchema,
  evidenceHash: HashSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();

export const GeneralAssetAuthorizationArtifactsV4Schema =
  z.array(GeneralAssetAuthorizationArtifactV4Schema).min(1).max(8)
    .superRefine((values, context) => values.forEach((value, index) => {
      if (value.stageIndex !== index) context.addIssue({ code: "custom", path: [index, "stageIndex"],
        message: "Authorization stages are not ordered" });
    }));
