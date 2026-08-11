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
import { PAYMENT_CHAIN_ID } from "./support";

const HashSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex value")
  .transform((value) => value.toLowerCase() as Hash);

const LowercaseAddressSchema = z.string()
  .refine(isAddress, "Invalid EVM address")
  .refine((value) => value === value.toLowerCase(), "Owner must be lowercase")
  .transform((value) => value as Address);

const SignatureSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte signature")
  .transform((value) => value as Hex);

export const RevealProofSchema = z.object({
  version: z.literal(1),
  action: z.literal("cobia.reveal.v1"),
  realm: z.string().trim().min(1),
  requestId: z.string().uuid(),
  quoteId: HashSchema,
  owner: LowercaseAddressSchema,
  paymentChainId: z.literal(PAYMENT_CHAIN_ID),
  executionChainId: z.literal(196),
  paymentTermsHash: HashSchema,
  nonce: HashSchema,
  expiresAt: z.number().int().positive().safe(),
}).strict();

export type RevealProof = z.infer<typeof RevealProofSchema>;

export interface RevealProofContext {
  realm: string;
  requestId: string;
  quoteId: Hash;
  owner: Address;
  paymentChainId: typeof PAYMENT_CHAIN_ID;
  executionChainId: 196;
  paymentTermsHash: Hash;
  expiresAt: number;
}

interface BuildRevealProofInput extends RevealProofContext {
  nonce: Hash;
}

export function buildRevealProof(input: BuildRevealProofInput): RevealProof {
  return RevealProofSchema.parse({
    version: 1,
    action: "cobia.reveal.v1",
    ...input,
    owner: input.owner.toLowerCase(),
  });
}

export function revealProofCommitment(value: unknown): Hash {
  return commitment(RevealProofSchema.parse(value));
}

function assertExpectedContext(
  proof: RevealProof,
  expected: RevealProofContext,
  requireTermsExpiry = true,
): void {
  const matches = proof.realm === expected.realm
    && proof.requestId === expected.requestId
    && proof.quoteId === expected.quoteId.toLowerCase()
    && isAddressEqual(proof.owner, expected.owner)
    && proof.paymentChainId === expected.paymentChainId
    && proof.executionChainId === expected.executionChainId
    && proof.paymentTermsHash === expected.paymentTermsHash.toLowerCase()
    && (!requireTermsExpiry || proof.expiresAt === expected.expiresAt);
  if (!matches) throw new Error("Reveal proof does not match the expected context");
}

async function assertOwnerSignature(proof: RevealProof, signature: Hex): Promise<void> {
  const signer = await recoverMessageAddress({
    message: { raw: revealProofCommitment(proof) },
    signature: SignatureSchema.parse(signature),
  });
  if (!isAddressEqual(signer, proof.owner)) {
    throw new Error("Reveal proof signature does not match owner");
  }
}

export async function verifyRevealRecoveryProof(
  value: unknown,
  signature: Hex,
  expected: RevealProofContext,
  nowSec: number,
): Promise<RevealProof> {
  const proof = RevealProofSchema.parse(value);
  assertExpectedContext(proof, expected, false);
  if (proof.expiresAt <= nowSec) throw new Error("Reveal recovery proof has expired");
  if (proof.expiresAt > nowSec + 300) throw new Error("Reveal recovery proof is too long-lived");
  await assertOwnerSignature(proof, signature);
  return proof;
}

export async function verifyRevealProof(
  value: unknown,
  signature: Hex,
  expected: RevealProofContext,
  nowSec: number,
): Promise<RevealProof> {
  const proof = RevealProofSchema.parse(value);
  assertExpectedContext(proof, expected);
  if (proof.expiresAt <= nowSec) throw new Error("Reveal proof has expired");
  await assertOwnerSignature(proof, signature);
  return proof;
}
