import { commitment } from "@cobia/domain";
import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

export const CommerceOrderProgramV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal("commerce-order"),
  requestId: z.string().uuid(),
  chainId: z.union([z.literal(196), z.literal(8453)]),
  policyHash: HashSchema,
  manifestHash: HashSchema,
  owner: AddressSchema,
  executor: AddressSchema,
  pinnedBlock: z.object({ number: PositiveAtomicSchema, hash: HashSchema }).strict(),
  deadline: z.number().int().positive().safe(),
  nonce: HashSchema,
  capability: z.object({
    id: z.literal("commerce.order.place"),
    version: z.literal(1),
  }).strict(),
  parameters: z.object({
    offerCommitment: HashSchema,
    quantity: PositiveAtomicSchema,
    orderCommitment: HashSchema,
    evidenceProfile: z.enum(["onchain-order", "payment-settled"]),
  }).strict(),
}).strict();

export type CommerceOrderProgramV1 = z.infer<typeof CommerceOrderProgramV1Schema>;

export function commerceOrderProgramCommitmentV1(input: CommerceOrderProgramV1): Hash {
  return commitment(CommerceOrderProgramV1Schema.parse(input)) as Hash;
}
