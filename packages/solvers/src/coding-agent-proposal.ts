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
const BlockNumberSchema = AtomicSchema.refine((value) => value !== "0");
const CalldataSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2}){4,}$/).transform(
  (value) => value.toLowerCase() as `0x${string}`,
);

const DeploymentIdentitySchema = z.object({
  address: AddressSchema,
  runtimeCodeHash: HashSchema,
  implementation: z.object({
    address: AddressSchema,
    runtimeCodeHash: HashSchema,
  }).strict().optional(),
}).strict();

const FinalBalanceSchema = z.object({
  asset: AddressSchema,
  owner: AddressSchema,
  atomic: AtomicSchema,
}).strict();

export const CodingAgentProposalV1Schema = z.object({
  version: z.literal(1),
  requestId: z.string().uuid(),
  policyHash: HashSchema,
  chainId: z.literal(196),
  owner: AddressSchema,
  deadline: z.number().int().positive(),
  calls: z.array(z.object({
    to: AddressSchema,
    valueAtomic: AtomicSchema,
    data: CalldataSchema,
  }).strict()).min(1).max(12),
  minimumFinalBalances: z.array(FinalBalanceSchema).max(8),
}).strict();

export const TrustedDeploymentManifestV1Schema = z.object({
  version: z.literal(1),
  chainId: z.literal(196),
  deployments: z.array(DeploymentIdentitySchema.extend({
    capability: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("erc20-approve"), approvalSpenders: z.array(AddressSchema).min(1).max(8) }).strict(),
      z.object({ kind: z.literal("aave-v3-supply") }).strict(),
    ]),
  }).strict()).min(1).max(64),
}).strict();

export const CodingAgentSimulationEvidenceV1Schema = z.object({
  version: z.literal(1),
  proposalHash: HashSchema,
  chainId: z.literal(196),
  blockNumber: BlockNumberSchema,
  blockHash: HashSchema,
  traceHash: HashSchema,
  stateDiffHash: HashSchema,
  finalBalances: z.array(FinalBalanceSchema).max(32),
  deployments: z.array(DeploymentIdentitySchema).max(64),
}).strict();

export type CodingAgentProposalV1 = z.infer<typeof CodingAgentProposalV1Schema>;
export type TrustedDeploymentManifestV1 = z.infer<typeof TrustedDeploymentManifestV1Schema>;
export type CodingAgentSimulationEvidenceV1 = z.infer<typeof CodingAgentSimulationEvidenceV1Schema>;

export function codingAgentProposalCommitment(input: unknown): Hash {
  return commitment(CodingAgentProposalV1Schema.parse(input));
}
