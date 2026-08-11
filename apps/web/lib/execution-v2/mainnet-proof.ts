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

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hash);
const BuyerSchema = z.string().refine(isAddress)
  .transform((value) => value.toLowerCase() as Address);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/)
  .transform((value) => value as Hex);

export const ExecutionMainnetProofSchema = z.object({
  version: z.literal(1),
  domain: z.literal("cobia.execution.mainnet.v1"),
  realm: z.string().trim().min(1).max(255),
  routeId: HashSchema,
  bundleHash: HashSchema,
  buyer: BuyerSchema,
  executionChainId: z.literal(196),
  rehearsalTraceHash: HashSchema,
  nonce: HashSchema,
  expiresAt: z.number().int().positive().safe(),
}).strict().superRefine((proof, context) => {
  if (proof.routeId !== proof.bundleHash) {
    context.addIssue({ code: "custom", message: "Route and bundle hashes must match" });
  }
});

export type ExecutionMainnetProof = z.infer<typeof ExecutionMainnetProofSchema>;

export function buildExecutionMainnetProof(
  input: Omit<ExecutionMainnetProof, "version" | "domain" | "buyer"> & { buyer: Address },
): ExecutionMainnetProof {
  return ExecutionMainnetProofSchema.parse({
    version: 1,
    domain: "cobia.execution.mainnet.v1",
    ...input,
    buyer: input.buyer.toLowerCase(),
  });
}

export function executionMainnetCommitment(value: unknown): Hash {
  return commitment(ExecutionMainnetProofSchema.parse(value));
}

export async function verifyExecutionMainnetProof(
  value: unknown,
  signature: Hex,
  nowSec: number,
): Promise<ExecutionMainnetProof> {
  const proof = ExecutionMainnetProofSchema.parse(value);
  if (!Number.isSafeInteger(nowSec) || nowSec < 0) {
    throw new Error("Current execution time is invalid");
  }
  if (proof.expiresAt <= nowSec) throw new Error("Mainnet execution proof has expired");
  if (proof.expiresAt > nowSec + 300) {
    throw new Error("Mainnet execution proof is too long-lived");
  }
  const signer = await recoverMessageAddress({
    message: { raw: executionMainnetCommitment(proof) },
    signature: SignatureSchema.parse(signature),
  });
  if (!isAddressEqual(signer, proof.buyer)) {
    throw new Error("Mainnet execution proof signature does not match buyer");
  }
  return proof;
}
