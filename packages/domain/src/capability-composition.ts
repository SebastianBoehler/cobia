import { canonicalJson } from "./canonical";
import {
  AtomicAmountSchema,
  BasisPointsSchema,
  HashSchema,
  PositiveAtomicAmountSchema,
  TimestampSchema,
} from "./primitives";
import { RouteAddressV2Schema } from "./routing-v2-policy";
import { RouteSnapshotV2Schema } from "./routing-v2-snapshot";
import { z } from "zod";

const CapabilityIdSchema = z.string()
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/)
  .max(128);
const CapabilityKeySchema = z.string()
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+@[1-9][0-9]*$/)
  .max(160);

const CapabilitySchema = z.object({
  id: CapabilityIdSchema,
  version: z.number().int().positive().safe(),
}).strict();

const MaximumConversionLossSchema = z.object({
  kind: z.literal("maximum-conversion-loss"),
  maximumLossBps: BasisPointsSchema.max(500),
}).strict();

const MinimumReceiptValueSchema = z.object({
  kind: z.literal("minimum-registered-receipt-value"),
  minimumValueBps: BasisPointsSchema.min(1),
  receiptCapabilities: z.array(CapabilityKeySchema).min(1).max(8),
}).strict();

const RequiredTerminalAssetSchema = z.object({
  kind: z.literal("required-terminal-asset"),
  asset: RouteAddressV2Schema,
}).strict();

export const CapabilityCompositionConstraintV1Schema = z.discriminatedUnion("kind", [
  MaximumConversionLossSchema,
  MinimumReceiptValueSchema,
  RequiredTerminalAssetSchema,
]);
export type CapabilityCompositionConstraintV1 = z.infer<
  typeof CapabilityCompositionConstraintV1Schema
>;

export const CapabilityCompositionObjectiveV1Schema = z.object({
  kind: z.literal("maximize-net-yield"),
  horizonDays: z.number().int().min(1).max(365),
  receiptCapabilities: z.array(CapabilityKeySchema).min(1).max(8),
}).strict();
export type CapabilityCompositionObjectiveV1 = z.infer<
  typeof CapabilityCompositionObjectiveV1Schema
>;

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function capabilityKey(value: { id: string; version: number }): string {
  return `${value.id}@${value.version}`;
}

export const CapabilityCompositionPolicyV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("capability-composition"),
  requestId: z.string().uuid(),
  displayGoal: z.string().trim().min(1).max(1_000),
  owner: RouteAddressV2Schema,
  executionChainId: z.literal(196),
  nonce: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  competition: z.object({
    closesAt: z.number().int().positive().safe(),
    maxRevisionsPerSolver: z.number().int().min(1).max(20),
  }).strict(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  manifestHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  input: z.object({
    token: RouteAddressV2Schema,
    maxAtomic: PositiveAtomicAmountSchema,
  }).strict(),
  allowedAssets: z.array(RouteAddressV2Schema).min(1).max(8),
  allowedCapabilities: z.array(CapabilitySchema).min(1).max(16),
  constraints: z.array(CapabilityCompositionConstraintV1Schema).min(1).max(8),
  objective: CapabilityCompositionObjectiveV1Schema,
  limits: z.object({
    maxActions: z.number().int().min(1).max(8),
    maxApprovals: z.number().int().min(0).max(16),
    maxActionCalldataBytes: z.number().int().min(4).max(16_384),
    maxExpectedGas: z.number().int().min(21_000).max(20_000_000),
    maxSolverFeeAtomic: AtomicAmountSchema,
  }).strict(),
  forbiddenTargets: z.array(RouteAddressV2Schema).max(32),
  forbiddenAssets: z.array(RouteAddressV2Schema).max(32),
}).strict().superRefine((policy, context) => {
  const capabilities = policy.allowedCapabilities.map(capabilityKey);
  if (!sortedUnique(capabilities)) {
    context.addIssue({ code: "custom", path: ["allowedCapabilities"],
      message: "Capabilities must be sorted and unique" });
  }
  for (const [field, values] of [
    ["allowedAssets", policy.allowedAssets],
    ["forbiddenTargets", policy.forbiddenTargets],
    ["forbiddenAssets", policy.forbiddenAssets],
  ] as const) {
    if (!sortedUnique(values)) context.addIssue({ code: "custom", path: [field],
      message: `${field} must be sorted and unique` });
  }
  if (!policy.allowedAssets.includes(policy.input.token)) {
    context.addIssue({ code: "custom", path: ["allowedAssets"],
      message: "Allowed assets must include the input" });
  }
  if (policy.forbiddenAssets.includes(policy.input.token) ||
      policy.allowedAssets.some((asset) => policy.forbiddenAssets.includes(asset))) {
    context.addIssue({ code: "custom", path: ["forbiddenAssets"],
      message: "Required assets cannot be forbidden" });
  }
  if (policy.createdAt >= policy.competition.closesAt ||
      policy.competition.closesAt > policy.deadline ||
      policy.competition.closesAt - policy.createdAt > 900) {
    context.addIssue({ code: "custom", path: ["competition"],
      message: "Competition time bounds are invalid" });
  }
  const constraintKinds = policy.constraints.map(({ kind }) => kind);
  if (new Set(constraintKinds).size !== constraintKinds.length ||
      !constraintKinds.includes("maximum-conversion-loss") ||
      !constraintKinds.includes("minimum-registered-receipt-value")) {
    context.addIssue({ code: "custom", path: ["constraints"],
      message: "Yield composition requires unique conversion and receipt constraints" });
  }
  const terminal = policy.constraints.find((constraint) =>
    constraint.kind === "required-terminal-asset");
  if (terminal && !policy.allowedAssets.includes(terminal.asset)) {
    context.addIssue({ code: "custom", path: ["constraints"],
      message: "Required terminal asset must be allowed" });
  }
  const allowed = new Set(capabilities);
  const receiptKeys = [
    ...policy.objective.receiptCapabilities,
    ...policy.constraints.flatMap((constraint) =>
      constraint.kind === "minimum-registered-receipt-value"
        ? constraint.receiptCapabilities : []),
  ];
  if (!sortedUnique(policy.objective.receiptCapabilities) ||
      receiptKeys.some((key) => !allowed.has(key))) {
    context.addIssue({ code: "custom", path: ["objective", "receiptCapabilities"],
      message: "Receipt capabilities must be sorted and allowed" });
  }
  if (new Set(policy.constraints.map(canonicalJson)).size !== policy.constraints.length) {
    context.addIssue({ code: "custom", path: ["constraints"],
      message: "Constraints must be unique" });
  }
});
export type CapabilityCompositionPolicyV1 = z.infer<
  typeof CapabilityCompositionPolicyV1Schema
>;

export const CapabilityCompositionSnapshotV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("capability-composition"),
  requestId: z.string().uuid(),
  capturedAt: TimestampSchema,
  manifestHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  route: RouteSnapshotV2Schema,
  gas: z.object({
    priceAtomic: PositiveAtomicAmountSchema,
    nativePriceUsdE8: PositiveAtomicAmountSchema,
  }).strict(),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.route.requestId !== snapshot.requestId) {
    context.addIssue({ code: "custom", path: ["route", "requestId"],
      message: "Route snapshot request mismatch" });
  }
  if (snapshot.route.capturedAt !== snapshot.capturedAt) {
    context.addIssue({ code: "custom", path: ["capturedAt"],
      message: "Snapshot capture time mismatch" });
  }
});
export type CapabilityCompositionSnapshotV1 = z.infer<
  typeof CapabilityCompositionSnapshotV1Schema
>;

export function parseCapabilityCompositionPolicyV1(
  input: unknown,
  nowSec: number,
): CapabilityCompositionPolicyV1 {
  const policy = CapabilityCompositionPolicyV1Schema.parse(input);
  if (policy.deadline <= nowSec) throw new Error("Policy deadline must be in the future");
  return policy;
}
