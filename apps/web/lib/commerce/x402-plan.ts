import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commitment,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import {
  CommerceOrderProgramV1Schema,
  commerceOrderProgramCommitmentV1,
} from "@cobia/solvers";
import { isAddress, isAddressEqual, type Address, type Hash } from "viem";
import { z } from "zod";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
} from "./merchant-manifest";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const AtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

export const X402AuthorizationPlanV1Schema = z.object({
  version: z.literal(1), chainId: z.literal(196),
  offerCommitment: HashSchema, policyHash: HashSchema, programHash: HashSchema,
  owner: AddressSchema, payee: AddressSchema, asset: AddressSchema, amount: AtomicSchema,
  endpoint: z.url().refine((value) => new URL(value).protocol === "https:"),
  facilitator: z.url().refine((value) => new URL(value).protocol === "https:"),
  maxTimeoutSec: z.number().int().min(1).max(900),
  offerExpiresAt: z.number().int().positive().safe(),
  programDeadline: z.number().int().positive().safe(),
  authorizationNonce: HashSchema,
  token: z.object({
    runtimeCodeHash: HashSchema, eip712Name: z.string().min(1).max(128),
    eip712Version: z.string().min(1).max(32),
  }).strict(),
  settlement: z.object({
    topic0: HashSchema, fromTopicIndex: z.number().int().min(1).max(3),
    toTopicIndex: z.number().int().min(1).max(3),
  }).strict(),
}).strict();

export type X402AuthorizationPlanV1 = z.infer<typeof X402AuthorizationPlanV1Schema>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function compileX402AuthorizationPlanV1(raw: {
  program: unknown; policy: unknown; offer: unknown; manifest: unknown;
}): X402AuthorizationPlanV1 {
  const program = CommerceOrderProgramV1Schema.parse(raw.program);
  const policy = CommerceOrderPolicyV1Schema.parse(raw.policy);
  const offer = CommerceOfferV1Schema.parse(raw.offer);
  const manifest = CommerceMerchantManifestV1Schema.parse(raw.manifest);
  const offerHash = commerceOfferCommitmentV1(offer);
  const policyHash = commerceOrderPolicyCommitmentV1(policy);
  const manifestHash = commerceMerchantManifestCommitmentV1(manifest);
  invariant(program.policyHash === policyHash && program.manifestHash === manifestHash &&
    policy.merchantManifestHash === manifestHash && offer.merchant.manifestHash === manifestHash,
  "x402 program commitments do not match policy");
  invariant(policy.offerCommitment === offerHash && program.parameters.offerCommitment === offerHash,
    "x402 offer commitment mismatch");
  invariant(program.requestId === policy.requestId && program.nonce === policy.nonce &&
    program.deadline <= policy.deadline && isAddressEqual(program.owner, policy.owner),
  "x402 program policy mismatch");
  invariant(offer.eligibility.status === "executable", "x402 offer is not executable");
  invariant(offer.placement.kind === "x402-exact" && offer.evidence.profile === "payment-settled" &&
    policy.evidenceProfile === "payment-settled" && program.parameters.evidenceProfile === "payment-settled",
  "x402 offer placement is unsupported");
  invariant(offer.payment.chainId === 196 && offer.payment.scheme === "exact" &&
    isAddressEqual(offer.payment.asset, policy.payment.asset) &&
    BigInt(offer.payment.atomicAmount) <= BigInt(policy.payment.maxAtomic), "x402 payment bound mismatch");
  invariant(isAddressEqual(offer.evidence.receiptRecipient, policy.receiptRecipient) &&
    isAddressEqual(policy.receiptRecipient, policy.owner), "x402 receipt recipient mismatch");
  const entry = manifest.entries.find((candidate) => candidate.merchantId === offer.merchant.id &&
    candidate.productCommitment === offer.product.commitment);
  invariant(entry?.placement.kind === "x402-exact" && entry.receipt.kind === "eip3009-transfer",
    "x402 merchant is not registered");
  invariant(entry.placement.endpoint === offer.placement.endpoint &&
    isAddressEqual(entry.payee, offer.merchant.payee) && isAddressEqual(entry.paymentAsset, offer.payment.asset) &&
    entry.exactAtomicAmount === offer.payment.atomicAmount, "x402 merchant semantics mismatch");
  const authorizationNonce = commitment({
    version: 1, kind: "cobia-x402-authorization", policyHash,
    offerCommitment: offerHash, orderCommitment: program.parameters.orderCommitment,
  }) as Hash;
  return X402AuthorizationPlanV1Schema.parse({
    version: 1, chainId: 196, offerCommitment: offerHash, policyHash,
    programHash: commerceOrderProgramCommitmentV1(program), owner: policy.owner,
    payee: entry.payee, asset: entry.paymentAsset, amount: entry.exactAtomicAmount,
    endpoint: entry.placement.endpoint, facilitator: entry.placement.facilitator,
    maxTimeoutSec: offer.payment.maxTimeoutSec, offerExpiresAt: offer.expiresAt,
    programDeadline: program.deadline, authorizationNonce,
    token: entry.placement.token,
    settlement: {
      topic0: entry.receipt.topic0, fromTopicIndex: entry.receipt.fromTopicIndex,
      toTopicIndex: entry.receipt.toTopicIndex,
    },
  });
}
