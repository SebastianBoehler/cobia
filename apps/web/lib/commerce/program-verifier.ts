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
import { isAddressEqual, type Address, type Hash } from "viem";
import { z } from "zod";
import { compileCommerceOrderActionV1 } from "../capabilities/commerce-order";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
} from "./merchant-manifest";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));

export const CommerceProgramEvidenceV1Schema = z.object({
  version: z.literal(1),
  chainId: z.literal(196),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema,
  capturedAtSec: z.number().int().positive().safe(),
  programHash: HashSchema,
  compiledActionHash: HashSchema,
  traceHash: HashSchema,
  stateDiffHash: HashSchema,
  receiptCommitment: HashSchema,
}).strict();

export type CommerceProgramEvidenceV1 = z.infer<typeof CommerceProgramEvidenceV1Schema>;
export type CommerceProgramRejectionCodeV1 =
  | "ANCHOR_MISMATCH" | "CHAIN_UNSUPPORTED" | "MERCHANT_UNREGISTERED"
  | "OFFER_CHANGED" | "OFFER_EXPIRED" | "PAYEE_MISMATCH"
  | "POLICY_MISMATCH" | "PRICE_BOUND_EXCEEDED" | "PROGRAM_SCHEMA_INVALID"
  | "RECEIPT_RECIPIENT_MISMATCH" | "REPLAY_MISMATCH" | "STALE_EVIDENCE"
  | "TARGET_CODE_MISMATCH";

type ReplayResult = {
  reproduced: boolean;
  compiledActionHash?: Hash;
  traceHash?: Hash;
  stateDiffHash?: Hash;
  receiptCommitment?: Hash;
};

function rawChainMismatch(value: unknown, field: string): boolean {
  return Boolean(value && typeof value === "object" && field in value &&
    (value as Record<string, unknown>)[field] !== 196);
}

function sameReplay(evidence: CommerceProgramEvidenceV1, replay: ReplayResult): boolean {
  return replay.reproduced && replay.compiledActionHash === evidence.compiledActionHash &&
    replay.traceHash === evidence.traceHash && replay.stateDiffHash === evidence.stateDiffHash &&
    replay.receiptCommitment === evidence.receiptCommitment;
}

export async function verifyCommerceProgramV1(input: {
  policy: unknown;
  offer: unknown;
  manifest: unknown;
  program: unknown;
  evidence: unknown;
  wallet: Address;
  executor: Address;
  nowSec: number;
  confirmAnchor(block: { number: string; hash: Hash }): Promise<boolean>;
  readCodeHash(address: Address, block: { number: string; hash: Hash }): Promise<Hash>;
  replay(compiled: ReturnType<typeof compileCommerceOrderActionV1>, evidence: CommerceProgramEvidenceV1): Promise<ReplayResult>;
}) {
  const rawChain = rawChainMismatch(input.program, "chainId") ||
    rawChainMismatch(input.evidence, "chainId") || rawChainMismatch(input.policy, "executionChainId");
  let program: ReturnType<typeof CommerceOrderProgramV1Schema.parse>;
  try { program = CommerceOrderProgramV1Schema.parse(input.program); } catch {
    return {
      accepted: false,
      errorCodes: [rawChain ? "CHAIN_UNSUPPORTED" : "PROGRAM_SCHEMA_INVALID"] as CommerceProgramRejectionCodeV1[],
      compiled: null,
    };
  }

  const errors = new Set<CommerceProgramRejectionCodeV1>();
  if (rawChain) errors.add("CHAIN_UNSUPPORTED");
  let policy: ReturnType<typeof CommerceOrderPolicyV1Schema.parse>;
  let offer: ReturnType<typeof CommerceOfferV1Schema.parse>;
  let manifest: ReturnType<typeof CommerceMerchantManifestV1Schema.parse>;
  let evidence: CommerceProgramEvidenceV1;
  try {
    policy = CommerceOrderPolicyV1Schema.parse(input.policy);
    offer = CommerceOfferV1Schema.parse(input.offer);
    manifest = CommerceMerchantManifestV1Schema.parse(input.manifest);
    evidence = CommerceProgramEvidenceV1Schema.parse(input.evidence);
  } catch {
    return { accepted: false, errorCodes: [rawChain ? "CHAIN_UNSUPPORTED" : "POLICY_MISMATCH"] as CommerceProgramRejectionCodeV1[], compiled: null };
  }

  const offerHash = commerceOfferCommitmentV1(offer);
  const manifestHash = commerceMerchantManifestCommitmentV1(manifest);
  if (program.parameters.offerCommitment !== offerHash || policy.offerCommitment !== offerHash) {
    errors.add("OFFER_CHANGED");
  }
  if (program.policyHash !== commerceOrderPolicyCommitmentV1(policy) ||
    program.requestId !== policy.requestId || program.nonce !== policy.nonce ||
    program.deadline > policy.deadline || !isAddressEqual(program.owner, policy.owner) ||
    !isAddressEqual(program.owner, input.wallet) || !isAddressEqual(program.executor, input.executor) ||
    program.parameters.evidenceProfile !== policy.evidenceProfile) errors.add("POLICY_MISMATCH");
  if (program.manifestHash !== manifestHash || policy.merchantManifestHash !== manifestHash ||
    offer.merchant.manifestHash !== manifestHash) errors.add("MERCHANT_UNREGISTERED");
  if (input.nowSec >= offer.expiresAt) errors.add("OFFER_EXPIRED");
  if (offer.eligibility.status !== "executable") errors.add("MERCHANT_UNREGISTERED");
  if (!isAddressEqual(offer.merchant.payee, manifest.entries.find((entry) =>
    entry.merchantId === offer.merchant.id && entry.productCommitment === offer.product.commitment)?.payee ?? input.wallet)) {
    errors.add("PAYEE_MISMATCH");
  }
  if (!isAddressEqual(offer.evidence.receiptRecipient, policy.receiptRecipient)) {
    errors.add("RECEIPT_RECIPIENT_MISMATCH");
  }
  if (!isAddressEqual(offer.payment.asset, policy.payment.asset) ||
    BigInt(offer.payment.atomicAmount) > BigInt(policy.payment.maxAtomic)) errors.add("PRICE_BOUND_EXCEEDED");
  if (evidence.programHash !== commerceOrderProgramCommitmentV1(program) ||
    evidence.blockNumber !== program.pinnedBlock.number || evidence.blockHash !== program.pinnedBlock.hash ||
    input.nowSec > evidence.capturedAtSec + policy.maxEvidenceAgeSec || input.nowSec > program.deadline) {
    errors.add("STALE_EVIDENCE");
  }
  try {
    if (!(await input.confirmAnchor(program.pinnedBlock))) errors.add("ANCHOR_MISMATCH");
  } catch { errors.add("ANCHOR_MISMATCH"); }

  let compiled: ReturnType<typeof compileCommerceOrderActionV1> | null = null;
  try {
    compiled = compileCommerceOrderActionV1({ program, policy, offer, manifest });
  } catch {
    if (!errors.has("OFFER_CHANGED") && !errors.has("PRICE_BOUND_EXCEEDED") &&
      !errors.has("RECEIPT_RECIPIENT_MISMATCH")) errors.add("MERCHANT_UNREGISTERED");
  }
  if (compiled) {
    if (evidence.compiledActionHash !== commitment(compiled)) errors.add("REPLAY_MISMATCH");
    for (const deployment of compiled.deployments) {
      try {
        if (await input.readCodeHash(deployment.address, program.pinnedBlock) !== deployment.runtimeCodeHash) {
          errors.add("TARGET_CODE_MISMATCH");
        }
      } catch { errors.add("TARGET_CODE_MISMATCH"); }
    }
    try {
      if (!sameReplay(evidence, await input.replay(compiled, evidence))) errors.add("REPLAY_MISMATCH");
    } catch { errors.add("REPLAY_MISMATCH"); }
  }
  return { accepted: errors.size === 0, errorCodes: [...errors].sort(), compiled };
}
