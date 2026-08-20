import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { commitment } from "./canonical";

const CanonicalAddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
  "Addresses must use lowercase canonical form",
).transform((value) => value as Address);
const CanonicalHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform(
  (value) => value as Hash,
);
const SelectorSchema = z.string().regex(/^0x[0-9a-f]{8}$/).transform(
  (value) => value as Hex,
);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const PositiveAtomicSchema = AtomicSchema.refine((value) => value !== "0");
const ChainSchema = z.union([z.literal(1), z.literal(196)]);
const StageIdSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(96);
const ProviderSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*@[1-9][0-9]*$/).max(96);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(96);

const baseStage = {
  id: StageIdSchema,
  chainId: ChainSchema,
  dependsOn: z.array(StageIdSchema).max(8),
};

const AssetAmountSchema = z.object({
  token: CanonicalAddressSchema,
  atomic: PositiveAtomicSchema,
}).strict();

const MinimumOutputSchema = z.object({
  chainId: ChainSchema,
  token: CanonicalAddressSchema,
  minimumAtomic: PositiveAtomicSchema,
}).strict();

const WalletTransactionStageSchema = z.object({
  ...baseStage,
  kind: z.literal("wallet-transaction"),
  provider: ProviderSchema,
  quoteHash: CanonicalHashSchema,
  responseHash: CanonicalHashSchema,
  fetchedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
  sender: CanonicalAddressSchema,
  recipient: CanonicalAddressSchema,
  input: AssetAmountSchema,
  output: MinimumOutputSchema,
  approval: z.object({
    token: CanonicalAddressSchema,
    spender: CanonicalAddressSchema,
    maximumAtomic: PositiveAtomicSchema,
  }).strict().optional(),
  transaction: z.object({
    target: CanonicalAddressSchema,
    selector: SelectorSchema,
    dataHash: CanonicalHashSchema,
    valueAtomic: AtomicSchema,
  }).strict(),
  tools: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(64)).min(1).max(16),
}).strict();

const AsyncDeliveryStageSchema = z.object({
  ...baseStage,
  kind: z.literal("async-delivery"),
  provider: ProviderSchema,
  sourceStageId: StageIdSchema,
  recipient: CanonicalAddressSchema,
  output: z.object({
    token: CanonicalAddressSchema,
    minimumAtomic: PositiveAtomicSchema,
  }).strict(),
  maximumWaitSec: z.number().int().min(60).max(86_400),
}).strict();

const CobiaV3StageSchema = z.object({
  ...baseStage,
  kind: z.literal("cobia-v3"),
  chainId: z.literal(196),
  executionCommitment: CanonicalHashSchema,
  input: AssetAmountSchema,
  minimumOutcomes: z.array(z.object({
    token: CanonicalAddressSchema,
    minimumAtomic: PositiveAtomicSchema,
  }).strict()).min(1).max(8),
}).strict();

const X402StageSchema = z.object({
  ...baseStage,
  kind: z.literal("x402-authorization"),
  chainId: z.literal(196),
  payer: CanonicalAddressSchema,
  payee: CanonicalAddressSchema,
  asset: CanonicalAddressSchema,
  exactAtomic: PositiveAtomicSchema,
  offerCommitment: CanonicalHashSchema,
  validAfter: z.number().int().nonnegative().safe(),
  validBefore: z.number().int().positive().safe(),
}).strict();

const ResearchStageSchema = z.object({
  ...baseStage,
  kind: z.literal("research"),
  plugin: ProviderSchema,
  sourceHash: CanonicalHashSchema,
  reasonCode: ReasonCodeSchema,
}).strict();

export const TransactionStageV1Schema = z.discriminatedUnion("kind", [
  CobiaV3StageSchema,
  WalletTransactionStageSchema,
  AsyncDeliveryStageSchema,
  X402StageSchema,
  ResearchStageSchema,
]);

export const TransactionProgramV1Schema = z.object({
  version: z.literal(1),
  programId: z.string().uuid(),
  requestId: z.string().uuid(),
  policyHash: CanonicalHashSchema,
  owner: CanonicalAddressSchema,
  createdAt: z.number().int().positive().safe(),
  deadline: z.number().int().positive().safe(),
  maxEvidenceAgeSec: z.number().int().min(30).max(900),
  stages: z.array(TransactionStageV1Schema).min(1).max(16),
}).strict().superRefine((program, context) => {
  if (program.createdAt >= program.deadline) {
    context.addIssue({ code: "custom", path: ["deadline"], message: "Deadline must follow creation" });
  }
  const prior = new Set<string>();
  program.stages.forEach((stage, index) => {
    if (index > 0 && program.stages[index - 1]!.id >= stage.id) {
      context.addIssue({ code: "custom", path: ["stages", index, "id"], message: "Stage IDs must be sorted and unique" });
    }
    if (!stage.dependsOn.every((id, dependencyIndex) =>
      prior.has(id) && (dependencyIndex === 0 || stage.dependsOn[dependencyIndex - 1]! < id))) {
      context.addIssue({ code: "custom", path: ["stages", index, "dependsOn"], message: "Dependencies must be sorted prior stages" });
    }
    if (stage.kind === "wallet-transaction" &&
      (stage.sender !== program.owner || stage.recipient !== program.owner)) {
      context.addIssue({ code: "custom", path: ["stages", index], message: "Wallet stage must preserve owner" });
    }
    if (stage.kind === "async-delivery") {
      if (stage.recipient !== program.owner || stage.sourceStageId !== stage.dependsOn.at(-1)) {
        context.addIssue({ code: "custom", path: ["stages", index], message: "Delivery must bind owner and source" });
      }
    }
    if (stage.kind === "x402-authorization" && stage.payer !== program.owner) {
      context.addIssue({ code: "custom", path: ["stages", index, "payer"], message: "x402 payer must be owner" });
    }
    prior.add(stage.id);
  });
});

export type TransactionStageV1 = z.infer<typeof TransactionStageV1Schema>;
export type TransactionProgramV1 = z.infer<typeof TransactionProgramV1Schema>;

export function parseTransactionProgramV1(input: unknown, nowSec: number): TransactionProgramV1 {
  const program = TransactionProgramV1Schema.parse(input);
  if (program.deadline <= nowSec) throw new Error("Transaction program expired");
  for (const stage of program.stages) {
    if (stage.kind === "wallet-transaction") {
      if (stage.expiresAt <= nowSec) throw new Error(`Stage ${stage.id} quote expired`);
      if (stage.fetchedAt > nowSec || nowSec - stage.fetchedAt > program.maxEvidenceAgeSec) {
        throw new Error(`Stage ${stage.id} evidence is stale`);
      }
    }
    if (stage.kind === "x402-authorization" && stage.validBefore <= nowSec) {
      throw new Error(`Stage ${stage.id} authorization expired`);
    }
  }
  return program;
}

export function transactionProgramCommitmentV1(program: TransactionProgramV1): Hash {
  return commitment(TransactionProgramV1Schema.parse(program)) as Hash;
}
