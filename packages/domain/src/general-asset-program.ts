import { HashSchema, PositiveAtomicAmountSchema } from "./primitives";
import { ChainAssetIdentityV1Schema, GeneralAssetChainIdSchema } from "./general-asset-evidence";
import { z } from "zod";

const NonZeroHashSchema = HashSchema.refine(
  (value) => value === value.toLowerCase() && !/^0x0{64}$/.test(value),
  "Hash must be nonzero lowercase hex",
);
const CanonicalAddressSchema = ChainAssetIdentityV1Schema.shape.token;
const AtomicAmountSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const AdapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128),
  version: z.number().int().positive().safe(),
}).strict();
const StageOutputSchema = z.object({
  token: CanonicalAddressSchema,
  minimumIncreaseAtomic: PositiveAtomicAmountSchema,
}).strict();
const DeliverySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({
    kind: z.literal("bridge"),
    destinationChainId: GeneralAssetChainIdSchema,
    recipient: CanonicalAddressSchema,
    minimumDeliveredAtomic: PositiveAtomicAmountSchema,
  }).strict(),
]);

const GeneralAssetStageV1Schema = z.object({
  stageId: NonZeroHashSchema,
  index: z.number().int().min(0).max(7),
  chainId: GeneralAssetChainIdSchema,
  predecessorStageId: NonZeroHashSchema.nullable(),
  adapter: AdapterSchema,
  target: CanonicalAddressSchema,
  targetRuntimeCodeHash: NonZeroHashSchema,
  calldata: z.string().regex(/^0x(?:[0-9a-f]{2}){4,8192}$/),
  nativeValueAtomic: AtomicAmountSchema,
  input: z.object({
    token: CanonicalAddressSchema,
    maximumAtomic: PositiveAtomicAmountSchema,
    maximumUsdE8: PositiveAtomicAmountSchema,
    identityEvidenceHash: NonZeroHashSchema,
    valuationEvidenceHash: NonZeroHashSchema,
  }).strict(),
  outputs: z.array(StageOutputSchema.extend({
    identityEvidenceHash: NonZeroHashSchema,
  }).strict()).min(1).max(8),
  approvals: z.array(z.object({
    token: CanonicalAddressSchema,
    spender: CanonicalAddressSchema,
    maximumAtomic: PositiveAtomicAmountSchema,
  }).strict()).max(16),
  refundTokens: z.array(CanonicalAddressSchema).min(1).max(16),
  finality: z.object({ confirmations: z.number().int().min(1).max(256) }).strict(),
  delivery: DeliverySchema,
}).strict();
export type GeneralAssetStageV1 = z.infer<typeof GeneralAssetStageV1Schema>;

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const GeneralAssetProgramV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-asset-program"),
  policyHash: NonZeroHashSchema,
  manifestHash: NonZeroHashSchema,
  canonicalProgramHash: NonZeroHashSchema,
  owner: CanonicalAddressSchema,
  deadline: z.number().int().positive().safe(),
  identityEvidenceHashes: z.array(NonZeroHashSchema).min(1).max(16),
  valuationEvidenceHashes: z.array(NonZeroHashSchema).min(1).max(16),
  stages: z.array(GeneralAssetStageV1Schema).min(1).max(8),
  finalOutput: ChainAssetIdentityV1Schema.extend({
    minimumAtomic: PositiveAtomicAmountSchema,
  }).strict(),
}).strict().superRefine((program, context) => {
  for (const field of ["identityEvidenceHashes", "valuationEvidenceHashes"] as const) {
    if (!sortedUnique(program[field])) {
      context.addIssue({ code: "custom", path: [field], message: `${field} must be sorted and unique` });
    }
  }
  program.stages.forEach((stage, index) => {
    if (stage.index !== index) {
      context.addIssue({ code: "custom", path: ["stages", index, "index"], message: "Stages must be ordered" });
    }
    const expectedPredecessor = index === 0 ? null : program.stages[index - 1]!.stageId;
    if (stage.predecessorStageId !== expectedPredecessor) {
      context.addIssue({ code: "custom", path: ["stages", index, "predecessorStageId"], message: "Stage predecessor is invalid" });
    }
    if (!sortedUnique(stage.outputs.map(({ token }) => token)) ||
        !sortedUnique(stage.refundTokens) ||
        !sortedUnique(stage.approvals.map(({ token, spender }) => `${token}:${spender}`))) {
      context.addIssue({ code: "custom", path: ["stages", index], message: "Stage assets must be sorted and unique" });
    }
    if (!program.identityEvidenceHashes.includes(stage.input.identityEvidenceHash) ||
        !program.valuationEvidenceHashes.includes(stage.input.valuationEvidenceHash) ||
        stage.outputs.some(({ identityEvidenceHash }) =>
          !program.identityEvidenceHashes.includes(identityEvidenceHash))) {
      context.addIssue({ code: "custom", path: ["stages", index],
        message: "Stage evidence must be committed by the program" });
    }
    if (index < program.stages.length - 1) {
      const next = program.stages[index + 1]!;
      if (stage.delivery.kind !== "bridge" || stage.delivery.destinationChainId !== next.chainId) {
        context.addIssue({ code: "custom", path: ["stages", index, "delivery"], message: "Stage delivery must reach the next chain" });
      }
    } else if (stage.delivery.kind !== "none") {
      context.addIssue({ code: "custom", path: ["stages", index, "delivery"], message: "Final stage cannot declare another delivery" });
    }
  });
  const finalStage = program.stages.at(-1);
  const finalOutput = finalStage?.outputs.find(({ token }) => token === program.finalOutput.token);
  if (!finalStage || finalStage.chainId !== program.finalOutput.chainId || !finalOutput ||
      BigInt(finalOutput.minimumIncreaseAtomic) < BigInt(program.finalOutput.minimumAtomic)) {
    context.addIssue({ code: "custom", path: ["finalOutput"], message: "Final output is not produced by the final stage" });
  }
});
export type GeneralAssetProgramV1 = z.infer<typeof GeneralAssetProgramV1Schema>;

export function parseGeneralAssetProgramV1(input: unknown): GeneralAssetProgramV1 {
  return GeneralAssetProgramV1Schema.parse(input);
}
