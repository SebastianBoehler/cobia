import {
  GeneralBalanceConstraintV1Schema,
  GeneralIntentObjectiveV1Schema,
  StaticPredicateV1Schema,
  canonicalJson,
  commitment,
} from "@cobia/domain";
import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import { CapabilityActionV1Schema } from "./program";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/);

export const CapabilityProgramV2Schema = z.object({
  version: z.literal(2),
  kind: z.literal("general-onchain"),
  requestId: z.string().uuid(),
  chainId: z.literal(196),
  policyHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  manifestHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  owner: AddressSchema,
  executor: AddressSchema,
  pinnedBlock: z.object({
    number: PositiveAtomicSchema,
    hash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  }).strict(),
  deadline: z.number().int().positive().safe(),
  nonce: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  input: z.object({ token: AddressSchema, atomic: PositiveAtomicSchema }).strict(),
  actions: z.array(CapabilityActionV1Schema).min(1).max(8),
  balanceConstraints: z.array(GeneralBalanceConstraintV1Schema).max(8),
  predicates: z.array(StaticPredicateV1Schema).max(8),
  objective: GeneralIntentObjectiveV1Schema,
}).strict().superRefine((program, context) => {
  const predicates = program.predicates.map(canonicalJson);
  if (new Set(predicates).size !== predicates.length) {
    context.addIssue({ code: "custom", path: ["predicates"], message: "Predicates must be unique" });
  }
  if (program.balanceConstraints.length === 0 && !program.predicates.some(({ phase }) => phase === "after")) {
    context.addIssue({ code: "custom", message: "Program requires an enforceable post-state outcome" });
  }
});

export type CapabilityProgramV2 = z.infer<typeof CapabilityProgramV2Schema>;
export type CapabilityActionV2 = CapabilityProgramV2["actions"][number];

export function capabilityProgramCommitmentV2(input: unknown): Hash {
  return commitment(CapabilityProgramV2Schema.parse(input));
}
