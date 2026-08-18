import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const ReturnDataSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2}){32,4096}$/).transform(
  (value) => value.toLowerCase() as Hex,
);

const DeploymentSchema = z.object({
  address: AddressSchema,
  runtimeCodeHash: HashSchema,
  implementation: z.object({
    address: AddressSchema,
    runtimeCodeHash: HashSchema,
  }).strict().optional(),
}).strict();

const BalanceDeltaSchema = z.object({
  token: AddressSchema,
  account: AddressSchema,
  beforeAtomic: AtomicSchema,
  afterAtomic: AtomicSchema,
}).strict();

const ObservationSchema = z.object({
  readHash: HashSchema,
  phase: z.enum(["before", "after"]),
  returnData: ReturnDataSchema,
  decodedValue: z.string().min(1).max(128),
  satisfied: z.boolean(),
}).strict();

const ObjectiveObservationSchema = z.object({
  readHash: HashSchema,
  returnData: ReturnDataSchema,
  decodedValue: z.string().min(1).max(128),
}).strict();

export const CapabilityProgramEvidenceV2Schema = z.object({
  version: z.literal(2),
  kind: z.literal("general-onchain"),
  programHash: HashSchema,
  chainId: z.literal(196),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
  traceHash: HashSchema,
  stateDiffHash: HashSchema,
  eventsHash: HashSchema,
  balanceDeltas: z.array(BalanceDeltaSchema).max(32),
  deployments: z.array(DeploymentSchema).max(64),
  observations: z.array(ObservationSchema).max(8),
  objective: ObjectiveObservationSchema.optional(),
}).strict().superRefine((evidence, context) => {
  const keys = evidence.observations.map(({ readHash, phase }) => `${phase}:${readHash}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["observations"], message: "Observations must be unique" });
  }
});

export type CapabilityProgramEvidenceV2 = z.infer<typeof CapabilityProgramEvidenceV2Schema>;
