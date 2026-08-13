import { commitment } from "@cobia/domain";
import { getAddress, isAddressEqual, recoverMessageAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hash);
const ProofSchema = z.object({
  domain: z.literal("cobia.agent-execution-access.v1"),
  programId: z.string().uuid(),
  owner: z.string().transform((value) => getAddress(value)),
  realm: z.string().min(1).max(253),
  nonce: HashSchema,
  expiresAt: z.number().int().positive(),
  commitment: HashSchema,
}).strict();

export type AgentExecutionAccessProof = z.infer<typeof ProofSchema>;

export function buildAgentExecutionAccessProof(input: {
  programId: string;
  owner: Address;
  realm: string;
  nonce: Hash;
  expiresAt: number;
}): AgentExecutionAccessProof {
  const fields = {
    domain: "cobia.agent-execution-access.v1" as const,
    programId: input.programId,
    owner: getAddress(input.owner),
    realm: input.realm,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
  };
  return ProofSchema.parse({ ...fields, commitment: commitment(fields) });
}

export async function verifyAgentExecutionAccessProof(input: {
  proof: unknown;
  signature: Hex;
  nowSec: number;
}) {
  const proof = ProofSchema.parse(input.proof);
  const { commitment: declared, ...fields } = proof;
  if (commitment(fields) !== declared) throw new Error("Execution access proof commitment is invalid");
  if (proof.expiresAt <= input.nowSec) throw new Error("Execution access proof has expired");
  if (proof.expiresAt > input.nowSec + 300) throw new Error("Execution access proof is too long-lived");
  const recovered = await recoverMessageAddress({ message: { raw: declared }, signature: input.signature });
  if (!isAddressEqual(recovered, proof.owner)) throw new Error("Execution access proof signature is invalid");
  return proof;
}
