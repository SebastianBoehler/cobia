import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).refine(
  (value) => value === value.toLowerCase(),
).transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const AtomicSchema = z.string().regex(/^-?(0|[1-9][0-9]*)$/).max(79);
const UnsignedAtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const ChainSchema = z.union([z.literal(1), z.literal(196)]);

const CodeIdentitySchema = z.object({
  address: AddressSchema,
  runtimeCodeHash: HashSchema,
  implementation: z.object({
    address: AddressSchema,
    runtimeCodeHash: HashSchema,
  }).strict().optional(),
}).strict();

const AssetDeltaSchema = z.object({
  token: AddressSchema,
  account: AddressSchema,
  beforeAtomic: UnsignedAtomicSchema,
  afterAtomic: UnsignedAtomicSchema,
  deltaAtomic: AtomicSchema,
}).strict();

const AllowanceDeltaSchema = z.object({
  token: AddressSchema,
  owner: AddressSchema,
  spender: AddressSchema,
  beforeAtomic: UnsignedAtomicSchema,
  afterAtomic: UnsignedAtomicSchema,
}).strict();

export const TransactionStageSimulationV1Schema = z.object({
  stageId: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(96),
  chainId: ChainSchema,
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
  transactionDataHash: HashSchema,
  success: z.boolean(),
  calldataBytes: z.number().int().min(4).max(131_072),
  gasUsed: UnsignedAtomicSchema,
  traceHash: HashSchema,
  stateDiffHash: HashSchema,
  eventsHash: HashSchema,
  completeAssetCoverage: z.boolean(),
  assetDeltas: z.array(AssetDeltaSchema).max(128),
  allowanceDeltas: z.array(AllowanceDeltaSchema).max(128),
  codeIdentities: z.array(CodeIdentitySchema).max(128),
}).strict();

export const TransactionProgramEvidenceV1Schema = z.object({
  version: z.literal(1),
  programHash: HashSchema,
  capturedAt: z.number().int().positive().safe(),
  simulations: z.array(TransactionStageSimulationV1Schema).min(1).max(16),
}).strict().superRefine((evidence, context) => {
  const ids = evidence.simulations.map(({ stageId }) => stageId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["simulations"], message: "Stage simulations must be unique" });
  }
});

export type TransactionProgramEvidenceV1 = z.infer<typeof TransactionProgramEvidenceV1Schema>;
