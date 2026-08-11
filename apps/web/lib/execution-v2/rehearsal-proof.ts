import { commitment } from "@cobia/domain";
import {
  isAddress,
  isAddressEqual,
  recoverMessageAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";

const HashSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash")
  .transform((value) => value.toLowerCase() as Hash);

const BuyerSchema = z.string()
  .refine(isAddress, "Buyer must be an EVM address")
  .refine((value) => value === value.toLowerCase(), "Buyer must be lowercase")
  .transform((value) => value as Address);

const SignatureSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte signature")
  .transform((value) => value as Hex);

export const ExecutionRehearsalProofSchema = z.object({
  version: z.literal(1),
  domain: z.literal("cobia.execution.rehearsal.v1"),
  realm: z.string().trim().min(1).max(255),
  routeId: HashSchema,
  bundleHash: HashSchema,
  buyer: BuyerSchema,
  executionChainId: z.literal(196),
  nonce: HashSchema,
  expiresAt: z.number().int().positive().safe(),
}).strict();

export type ExecutionRehearsalProof = z.infer<typeof ExecutionRehearsalProofSchema>;

export function buildExecutionRehearsalProof(
  input: Omit<ExecutionRehearsalProof, "version" | "domain" | "buyer"> & {
    buyer: Address;
  },
): ExecutionRehearsalProof {
  return ExecutionRehearsalProofSchema.parse({
    version: 1,
    domain: "cobia.execution.rehearsal.v1",
    ...input,
    buyer: input.buyer.toLowerCase(),
  });
}

export function executionRehearsalCommitment(input: unknown): Hash {
  return commitment(ExecutionRehearsalProofSchema.parse(input));
}

export async function verifyExecutionRehearsalProof(
  input: unknown,
  signature: Hex,
  nowSec: number,
): Promise<ExecutionRehearsalProof> {
  const proof = ExecutionRehearsalProofSchema.parse(input);
  if (!Number.isSafeInteger(nowSec) || nowSec < 0) {
    throw new Error("Current rehearsal time is invalid");
  }
  if (proof.expiresAt <= nowSec) throw new Error("Execution rehearsal proof has expired");
  if (proof.expiresAt > nowSec + 300) {
    throw new Error("Execution rehearsal proof is too long-lived");
  }
  const signer = await recoverMessageAddress({
    message: { raw: executionRehearsalCommitment(proof) },
    signature: SignatureSchema.parse(signature),
  });
  if (!isAddressEqual(signer, proof.buyer)) {
    throw new Error("Execution rehearsal proof signature does not match buyer");
  }
  return proof;
}
