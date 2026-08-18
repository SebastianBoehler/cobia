import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const PositiveAtomicSchema = AtomicSchema.refine((value) => value !== "0");
export const CapabilityIdSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/).max(128);

export type CanonicalJsonValue =
  | null | boolean | number | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export const CanonicalJsonValueSchema: z.ZodType<CanonicalJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().int().safe(),
    z.string().max(2_048),
    z.array(CanonicalJsonValueSchema).max(64),
    z.record(z.string().min(1).max(128), CanonicalJsonValueSchema).superRefine(
      (value, context) => {
        if (Object.keys(value).length > 64) {
          context.addIssue({ code: "custom", message: "JSON object exceeds 64 keys" });
        }
      },
    ),
  ]),
);

export const CapabilityActionV1Schema = z.object({
  capabilityId: CapabilityIdSchema,
  capabilityVersion: z.number().int().positive().safe(),
  valueAtomic: z.literal("0"),
  parameters: z.record(z.string().min(1).max(128), CanonicalJsonValueSchema),
}).strict();

const ConstraintSchema = z.object({
  token: AddressSchema,
  account: AddressSchema,
  minimumIncreaseAtomic: PositiveAtomicSchema,
}).strict();

export const CapabilityProgramV1Schema = z.object({
  version: z.literal(1),
  requestId: z.string().uuid(),
  chainId: z.literal(196),
  policyHash: HashSchema,
  manifestHash: HashSchema,
  owner: AddressSchema,
  executor: AddressSchema,
  pinnedBlock: z.object({
    number: PositiveAtomicSchema,
    hash: HashSchema,
  }).strict(),
  deadline: z.number().int().positive().safe(),
  nonce: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  input: z.object({ token: AddressSchema, atomic: PositiveAtomicSchema }).strict(),
  actions: z.array(CapabilityActionV1Schema).min(1).max(8),
  constraints: z.array(ConstraintSchema).min(1).max(8),
}).strict();

export type CapabilityProgramV1 = z.infer<typeof CapabilityProgramV1Schema>;
export type CapabilityActionV1 = CapabilityProgramV1["actions"][number];

export function capabilityProgramCommitmentV1(input: unknown): Hash {
  return commitment(CapabilityProgramV1Schema.parse(input));
}
