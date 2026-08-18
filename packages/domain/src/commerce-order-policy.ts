import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import { commitment } from "./canonical";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const CommerceOrderPolicyV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("commerce-order"),
  requestId: z.string().uuid(),
  displayGoal: z.string().trim().min(1).max(500),
  owner: AddressSchema,
  receiptRecipient: AddressSchema,
  executionChainId: z.literal(196),
  nonce: HashSchema,
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  competition: z.object({
    closesAt: z.number().int().positive().safe(),
    maxRevisionsPerSolver: z.number().int().min(1).max(20),
  }).strict(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  offerCommitment: HashSchema,
  merchantManifestHash: HashSchema,
  payment: z.object({ asset: AddressSchema, maxAtomic: PositiveAtomicSchema }).strict(),
  evidenceProfile: z.enum(["onchain-order", "payment-settled"]),
  allowedCapabilities: z.tuple([z.object({
    id: z.literal("commerce.order.place"),
    version: z.literal(1),
  }).strict()]),
  limits: z.object({
    maxActions: z.literal(1),
    maxApprovals: z.number().int().min(0).max(1),
    maxActionCalldataBytes: z.number().int().min(4).max(16_384),
    maxExpectedGas: z.number().int().min(21_000).max(5_000_000),
  }).strict(),
  forbiddenTargets: z.array(AddressSchema).max(32),
  forbiddenAssets: z.array(AddressSchema).max(32),
}).strict().superRefine((policy, context) => {
  if (policy.createdAt >= policy.deadline) {
    context.addIssue({ code: "custom", path: ["deadline"], message: "Policy deadline must follow creation" });
  }
  if (policy.competition.closesAt <= policy.createdAt || policy.competition.closesAt > policy.deadline ||
    policy.competition.closesAt - policy.createdAt > 900) {
    context.addIssue({ code: "custom", path: ["competition", "closesAt"], message: "Competition window is invalid" });
  }
  for (const field of ["forbiddenTargets", "forbiddenAssets"] as const) {
    if (!sortedUnique(policy[field])) {
      context.addIssue({ code: "custom", path: [field], message: `${field} must be sorted and unique` });
    }
  }
  if (policy.forbiddenAssets.includes(policy.payment.asset)) {
    context.addIssue({ code: "custom", path: ["payment", "asset"], message: "Payment asset is forbidden" });
  }
});

export type CommerceOrderPolicyV1 = z.infer<typeof CommerceOrderPolicyV1Schema>;

export function commerceOrderPolicyCommitmentV1(input: CommerceOrderPolicyV1): Hash {
  return commitment(CommerceOrderPolicyV1Schema.parse(input)) as Hash;
}

export function parseCommerceOrderPolicyV1(input: unknown, nowSec: number): CommerceOrderPolicyV1 {
  const policy = CommerceOrderPolicyV1Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Commerce policy deadline must be in the future");
  return policy;
}
