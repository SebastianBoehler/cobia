import { BasisPointsSchema, HashSchema, PositiveAtomicAmountSchema } from "./primitives";
import { ChainAssetIdentityV1Schema, GeneralAssetChainIdSchema } from "./general-asset-evidence";
import { z } from "zod";

const NonZeroHashSchema = HashSchema.refine(
  (value) => value === value.toLowerCase() && !/^0x0{64}$/.test(value),
  "Hash must be nonzero lowercase hex",
);
const AdapterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128),
  version: z.number().int().positive().safe(),
}).strict();
const OutputSchema = ChainAssetIdentityV1Schema.extend({
  minimumAtomic: PositiveAtomicAmountSchema,
}).strict();
const TargetSchema = z.object({
  chainId: GeneralAssetChainIdSchema,
  target: ChainAssetIdentityV1Schema.shape.token,
}).strict();

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function orderedAssetKeys(values: readonly { chainId: number; token: string }[]): boolean {
  return values.every((value, index) => index === 0 ||
    values[index - 1]!.chainId < value.chainId ||
    (values[index - 1]!.chainId === value.chainId && values[index - 1]!.token < value.token));
}

export const GeneralAssetPolicyV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-asset"),
  requestId: z.string().uuid(),
  displayGoal: z.string().trim().min(1).max(1_000),
  owner: ChainAssetIdentityV1Schema.shape.token,
  sourceChainId: GeneralAssetChainIdSchema,
  destinationChainId: GeneralAssetChainIdSchema,
  nonce: NonZeroHashSchema,
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  competition: z.object({
    closesAt: z.number().int().positive().safe(),
    maxRevisionsPerSolver: z.number().int().min(1).max(20),
  }).strict(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  manifestHash: NonZeroHashSchema,
  inputIdentityHash: NonZeroHashSchema,
  inputValuationHash: NonZeroHashSchema,
  input: ChainAssetIdentityV1Schema.extend({
    maximumAtomic: PositiveAtomicAmountSchema,
    maximumUsdE8: PositiveAtomicAmountSchema,
  }).strict(),
  outputs: z.array(OutputSchema).min(1).max(8),
  allowedAdapters: z.array(AdapterSchema).min(1).max(16),
  limits: z.object({
    maxStages: z.number().int().min(1).max(8),
    maxCallsPerStage: z.number().int().min(1).max(8),
    maxApprovals: z.number().int().min(0).max(16),
    maxCalldataBytes: z.number().int().min(4).max(16_384),
    maxGasPerStage: PositiveAtomicAmountSchema,
    maxNativeValueUsdE8: PositiveAtomicAmountSchema,
    maxBridgeFeeUsdE8: PositiveAtomicAmountSchema,
    maxSolverFeeUsdE8: z.string().regex(/^(0|[1-9][0-9]*)$/),
    maxConversionLossBps: BasisPointsSchema,
    maxSlippageBps: BasisPointsSchema,
  }).strict(),
  forbiddenTargets: z.array(TargetSchema).max(64),
  forbiddenAssets: z.array(ChainAssetIdentityV1Schema).max(64),
}).strict().superRefine((policy, context) => {
  if (policy.input.chainId !== policy.sourceChainId) {
    context.addIssue({ code: "custom", path: ["input", "chainId"], message: "Input must use the source chain" });
  }
  if (policy.outputs.some(({ chainId }) => chainId !== policy.destinationChainId)) {
    context.addIssue({ code: "custom", path: ["outputs"], message: "Outputs must use the destination chain" });
  }
  if (!orderedAssetKeys(policy.outputs)) {
    context.addIssue({ code: "custom", path: ["outputs"], message: "Outputs must be sorted and unique" });
  }
  const adapters = policy.allowedAdapters.map(({ id, version }) => `${id}@${version}`);
  if (!sortedUnique(adapters)) {
    context.addIssue({ code: "custom", path: ["allowedAdapters"], message: "Adapters must be sorted and unique" });
  }
  if (!orderedAssetKeys(policy.forbiddenAssets)) {
    context.addIssue({ code: "custom", path: ["forbiddenAssets"], message: "Forbidden assets must be sorted and unique" });
  }
  const targets = policy.forbiddenTargets.map(({ chainId, target }) => `${chainId}:${target}`);
  if (!sortedUnique(targets)) {
    context.addIssue({ code: "custom", path: ["forbiddenTargets"], message: "Forbidden targets must be sorted and unique" });
  }
  if (policy.createdAt >= policy.competition.closesAt || policy.competition.closesAt > policy.deadline ||
      policy.competition.closesAt - policy.createdAt > 900) {
    context.addIssue({ code: "custom", path: ["competition"], message: "Competition time bounds are invalid" });
  }
  const inputKey = `${policy.input.chainId}:${policy.input.token}`;
  const required = [inputKey, ...policy.outputs.map(({ chainId, token }) => `${chainId}:${token}`)];
  const forbidden = new Set(policy.forbiddenAssets.map(({ chainId, token }) => `${chainId}:${token}`));
  if (required.some((key) => forbidden.has(key))) {
    context.addIssue({ code: "custom", path: ["forbiddenAssets"], message: "Required assets cannot be forbidden" });
  }
});
export type GeneralAssetPolicyV1 = z.infer<typeof GeneralAssetPolicyV1Schema>;

export function parseGeneralAssetPolicyV1(input: unknown, nowSec: number): GeneralAssetPolicyV1 {
  const policy = GeneralAssetPolicyV1Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Policy deadline must be in the future");
  return policy;
}
