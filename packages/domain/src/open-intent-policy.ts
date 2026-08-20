import { canonicalJson } from "./canonical";
import { StaticPredicateV1Schema } from "./onchain-read";
import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
  "Addresses must use lowercase canonical form",
).transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const PositiveAtomicSchema = AtomicSchema.refine((value) => value !== "0");
const ChainSchema = z.union([z.literal(1), z.literal(196), z.literal(8453)]);

const AssetSchema = z.object({
  chainId: ChainSchema,
  token: AddressSchema,
}).strict();

const BalanceOutcomeSchema = z.object({
  kind: z.enum(["minimum-final", "minimum-increase"]),
  chainId: ChainSchema,
  token: AddressSchema,
  atomic: PositiveAtomicSchema,
}).strict();

const PredicateOutcomeSchema = z.object({
  kind: z.literal("onchain-predicate"),
  chainId: ChainSchema,
  predicate: StaticPredicateV1Schema,
}).strict();

const X402OutcomeSchema = z.object({
  kind: z.literal("x402-receipt"),
  chainId: z.union([z.literal(196), z.literal(8453)]),
  offerCommitment: HashSchema,
  maximumPayment: z.object({ token: AddressSchema, atomic: PositiveAtomicSchema }).strict(),
}).strict();

const RegisteredInstrumentOutcomeSchema = z.object({
  kind: z.literal("registered-instrument"),
  chainId: z.union([z.literal(1), z.literal(196), z.literal(8453)]),
  token: AddressSchema,
  minimumIncreaseAtomic: PositiveAtomicSchema,
  instrumentCommitment: HashSchema,
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  eligibilityAttested: z.literal(true),
}).strict();

export const OpenIntentOutcomeV3Schema = z.discriminatedUnion("kind", [
  BalanceOutcomeSchema,
  PredicateOutcomeSchema,
  X402OutcomeSchema,
  RegisteredInstrumentOutcomeSchema,
]);

const NativeValueSchema = z.object({
  chainId: ChainSchema,
  atomic: AtomicSchema,
}).strict();

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function assetKey(value: { chainId: number; token: string }): string {
  return `${value.chainId}:${value.token}`;
}

export const OpenIntentPolicyV3Schema = z.object({
  version: z.literal(3),
  kind: z.literal("open-onchain"),
  requestId: z.string().uuid(),
  displayGoal: z.string().trim().min(1).max(1_000),
  owner: AddressSchema,
  executionChainIds: z.array(ChainSchema).min(1).max(2),
  nonce: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  competition: z.object({
    closesAt: z.number().int().positive().safe(),
    maxRevisionsPerSolver: z.number().int().min(1).max(20),
  }).strict(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  inputs: z.array(AssetSchema.extend({ maximumAtomic: PositiveAtomicSchema })).min(1).max(8),
  outcomes: z.array(OpenIntentOutcomeV3Schema).min(1).max(8),
  limits: z.object({
    maxStages: z.number().int().min(1).max(16),
    maxTransactions: z.number().int().min(1).max(16),
    maxApprovals: z.number().int().min(0).max(32),
    maxCalldataBytes: z.number().int().min(4).max(131_072),
    maxGasPerTransaction: PositiveAtomicSchema,
    maxNativeValueAtomicByChain: z.array(NativeValueSchema).min(1).max(2),
  }).strict(),
  forbiddenTargets: z.array(AddressSchema).max(64),
  forbiddenAssets: z.array(AddressSchema).max(64),
}).strict().superRefine((policy, context) => {
  const chainKeys = policy.executionChainIds.map(String);
  if (!sortedUnique(chainKeys)) {
    context.addIssue({ code: "custom", path: ["executionChainIds"], message: "Chains must be sorted and unique" });
  }
  const declared = new Set(policy.executionChainIds);
  if (!declared.has(196)) {
    context.addIssue({ code: "custom", path: ["executionChainIds"], message: "Open intents must execute on X Layer" });
  }
  const inputKeys = policy.inputs.map(assetKey);
  if (!sortedUnique(inputKeys)) {
    context.addIssue({ code: "custom", path: ["inputs"], message: "Inputs must be sorted and unique" });
  }
  if (!policy.inputs.every(({ chainId }) => declared.has(chainId)) ||
      !policy.outcomes.every(({ chainId }) => declared.has(chainId))) {
    context.addIssue({ code: "custom", message: "Inputs and outcomes must use declared chains" });
  }
  const nativeChains = policy.limits.maxNativeValueAtomicByChain.map(({ chainId }) => chainId);
  if (canonicalJson(nativeChains) !== canonicalJson(policy.executionChainIds)) {
    context.addIssue({ code: "custom", path: ["limits", "maxNativeValueAtomicByChain"], message: "Every chain needs one native-value bound" });
  }
  for (const field of ["forbiddenTargets", "forbiddenAssets"] as const) {
    if (!sortedUnique(policy[field])) {
      context.addIssue({ code: "custom", path: [field], message: `${field} must be sorted and unique` });
    }
  }
  if (policy.inputs.some(({ token }) => policy.forbiddenAssets.includes(token)) ||
      policy.outcomes.some((outcome) => "token" in outcome && policy.forbiddenAssets.includes(outcome.token))) {
    context.addIssue({ code: "custom", path: ["forbiddenAssets"], message: "Required assets cannot be forbidden" });
  }
  if (new Set(policy.outcomes.map(canonicalJson)).size !== policy.outcomes.length) {
    context.addIssue({ code: "custom", path: ["outcomes"], message: "Outcomes must be unique" });
  }
  if (policy.createdAt >= policy.deadline || policy.competition.closesAt <= policy.createdAt ||
      policy.competition.closesAt > policy.deadline || policy.competition.closesAt - policy.createdAt > 900) {
    context.addIssue({ code: "custom", path: ["deadline"], message: "Policy time bounds are invalid" });
  }
});

export type OpenIntentPolicyV3 = z.infer<typeof OpenIntentPolicyV3Schema>;

export const OpenIntentSnapshotV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("open-onchain"),
  requestId: z.string().uuid(),
  capturedAt: z.string().datetime({ offset: true }),
  anchors: z.array(z.object({
    chainId: ChainSchema,
    blockNumber: z.string().regex(/^[1-9][0-9]*$/),
    blockHash: HashSchema,
  }).strict()).min(1).max(2),
}).strict().superRefine((snapshot, context) => {
  const chains = snapshot.anchors.map(({ chainId }) => String(chainId));
  if (!sortedUnique(chains)) {
    context.addIssue({ code: "custom", path: ["anchors"], message: "Anchors must be sorted and unique" });
  }
});

export type OpenIntentSnapshotV1 = z.infer<typeof OpenIntentSnapshotV1Schema>;

export function parseOpenIntentPolicyV3(input: unknown, nowSec: number): OpenIntentPolicyV3 {
  const policy = OpenIntentPolicyV3Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Policy deadline must be in the future");
  return policy;
}
