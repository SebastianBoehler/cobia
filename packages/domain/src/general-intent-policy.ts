import { canonicalJson } from "./canonical";
import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import {
  NumericStaticReadV1Schema,
  StaticPredicateV1Schema,
} from "./onchain-read";
import { PositiveAtomicAmountSchema, TimestampSchema } from "./primitives";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const PositiveBlockSchema = z.string().regex(/^[1-9][0-9]*$/);
const CapabilityIdSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128);

const CapabilitySchema = z.object({
  id: CapabilityIdSchema,
  version: z.number().int().positive().safe(),
}).strict();

const BalanceConstraintSchema = z.object({
  kind: z.enum(["minimumFinal", "minimumIncrease"]),
  token: AddressSchema,
  atomic: PositiveAtomicAmountSchema,
}).strict();

const ObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("satisfy") }).strict(),
  z.object({ kind: z.literal("maximize"), read: NumericStaticReadV1Schema }).strict(),
  z.object({ kind: z.literal("minimize"), read: NumericStaticReadV1Schema }).strict(),
]);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const GeneralIntentPolicyV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-onchain"),
  requestId: z.string().uuid(),
  owner: AddressSchema,
  executionChainId: z.literal(196),
  nonce: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  manifestHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  input: z.object({
    token: AddressSchema,
    maxAtomic: PositiveAtomicAmountSchema,
  }).strict(),
  allowedCapabilities: z.array(CapabilitySchema).min(1).max(16),
  limits: z.object({
    maxActions: z.number().int().min(1).max(8),
    maxApprovals: z.number().int().min(0).max(16),
    maxActionCalldataBytes: z.number().int().min(4).max(16_384),
    maxExpectedGas: z.number().int().min(21_000).max(20_000_000),
  }).strict(),
  forbiddenTargets: z.array(AddressSchema).max(32),
  forbiddenAssets: z.array(AddressSchema).max(32),
  balanceConstraints: z.array(BalanceConstraintSchema).max(8),
  predicates: z.array(StaticPredicateV1Schema).max(8),
  objective: ObjectiveSchema,
}).strict().superRefine((policy, context) => {
  const capabilities = policy.allowedCapabilities.map(({ id, version }) => `${id}@${version}`);
  if (!sortedUnique(capabilities)) {
    context.addIssue({ code: "custom", path: ["allowedCapabilities"], message: "Capabilities must be sorted and unique" });
  }
  for (const field of ["forbiddenTargets", "forbiddenAssets"] as const) {
    if (!sortedUnique(policy[field])) {
      context.addIssue({ code: "custom", path: [field], message: `${field} must be sorted and unique` });
    }
  }
  const predicateKeys = policy.predicates.map(canonicalJson);
  if (new Set(predicateKeys).size !== predicateKeys.length) {
    context.addIssue({ code: "custom", path: ["predicates"], message: "Predicates must be unique" });
  }
  if (policy.createdAt >= policy.deadline) {
    context.addIssue({ code: "custom", path: ["deadline"], message: "Policy deadline must follow creation" });
  }
  if (policy.balanceConstraints.length === 0 && !policy.predicates.some(({ phase }) => phase === "after")) {
    context.addIssue({ code: "custom", message: "Policy requires an enforceable post-state outcome" });
  }
  if (policy.forbiddenAssets.includes(policy.input.token)) {
    context.addIssue({ code: "custom", path: ["input", "token"], message: "Input asset is forbidden" });
  }
  policy.balanceConstraints.forEach(({ token }, index) => {
    if (policy.forbiddenAssets.includes(token)) {
      context.addIssue({ code: "custom", path: ["balanceConstraints", index, "token"], message: "Constraint asset is forbidden" });
    }
  });
  policy.predicates.forEach(({ target }, index) => {
    if (policy.forbiddenTargets.includes(target)) {
      context.addIssue({ code: "custom", path: ["predicates", index, "target"], message: "Predicate target is forbidden" });
    }
  });
});

export type GeneralIntentPolicyV1 = z.infer<typeof GeneralIntentPolicyV1Schema>;

export const GeneralIntentSnapshotV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("general-onchain"),
  requestId: z.string().uuid(),
  chainId: z.literal(196),
  blockNumber: PositiveBlockSchema,
  blockHash: HashSchema,
  capturedAt: TimestampSchema,
  manifestHash: HashSchema,
}).strict();

export type GeneralIntentSnapshotV1 = z.infer<typeof GeneralIntentSnapshotV1Schema>;

export function parseGeneralIntentPolicyV1(input: unknown, nowSec: number): GeneralIntentPolicyV1 {
  const policy = GeneralIntentPolicyV1Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Policy deadline must be in the future");
  return policy;
}
