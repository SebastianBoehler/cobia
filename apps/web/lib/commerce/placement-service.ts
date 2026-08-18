import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commitment,
  parseCommerceOrderPolicyV1,
  type CommerceOfferV1,
} from "@cobia/domain";
import { recoverMessageAddress, isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { prepareX402AuthorizationFromPlanV1 } from "./x402-authorization";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";

const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(
  (value) => value.toLowerCase() as Hex,
);

export type CommercePlacementErrorCodeV1 =
  | "INVALID_SIGNATURE" | "OFFER_NOT_FOUND" | "VERIFICATION_REJECTED"
  | "PLACEMENT_MODE_UNAVAILABLE";

export class CommercePlacementErrorV1 extends Error {
  constructor(
    readonly code: CommercePlacementErrorCodeV1,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
  }
}

type PlacementRootInput = {
  id: string; owner: Address; offerCommitment: Hash; policyHash: Hash;
  programHash: Hash; manifestHash: Hash; planHash: Hash;
  authorizationTemplateHash: Hash; observedAtSec: number;
};

export async function verifyCommercePolicyOwnerSignatureV1(
  policy: ReturnType<typeof CommerceOrderPolicyV1Schema.parse>,
  rawSignature: unknown,
): Promise<void> {
  const signature = SignatureSchema.parse(rawSignature);
  const signer = await recoverMessageAddress({ message: { raw: commitment(policy) }, signature });
  if (!isAddressEqual(signer, policy.owner)) {
    throw new CommercePlacementErrorV1("INVALID_SIGNATURE", "Commerce policy signature does not match owner");
  }
}

export async function prepareCommercePlacementV1(
  raw: { policy: unknown; ownerSignature: unknown; program: unknown; evidence: unknown },
  dependencies: {
    nowSec: number;
    executor: Address;
    manifest: unknown;
    offers: { get(commitment: string): Promise<CommerceOfferV1 | null> };
    placements: { prepare(input: PlacementRootInput): Promise<unknown> };
    verify(input: {
      policy: unknown; offer: unknown; manifest: unknown; program: unknown; evidence: unknown;
      wallet: Address; executor: Address; nowSec: number;
    }): Promise<{ accepted: boolean; errorCodes: readonly string[]; compiled: unknown }>;
  },
) {
  const policy = parseCommerceOrderPolicyV1(raw.policy, dependencies.nowSec);
  try {
    await verifyCommercePolicyOwnerSignatureV1(policy, raw.ownerSignature);
  } catch (error) {
    if (error instanceof CommercePlacementErrorV1) throw error;
    throw new CommercePlacementErrorV1("INVALID_SIGNATURE", "Commerce policy signature is invalid");
  }
  const storedOffer = await dependencies.offers.get(policy.offerCommitment);
  if (!storedOffer) throw new CommercePlacementErrorV1("OFFER_NOT_FOUND", "Commerce offer snapshot is unavailable");
  const offer = CommerceOfferV1Schema.parse(storedOffer);
  const verification = await dependencies.verify({
    policy, offer, manifest: dependencies.manifest, program: raw.program, evidence: raw.evidence,
    wallet: policy.owner, executor: dependencies.executor, nowSec: dependencies.nowSec,
  });
  if (!verification.accepted || verification.errorCodes.length > 0) {
    throw new CommercePlacementErrorV1(
      "VERIFICATION_REJECTED", "Commerce program failed independent verification", verification.errorCodes,
    );
  }
  const plan = X402AuthorizationPlanV1Schema.safeParse(verification.compiled);
  if (!plan.success) {
    throw new CommercePlacementErrorV1(
      "PLACEMENT_MODE_UNAVAILABLE", "Direct commerce requires the guarded V3 fork execution path",
    );
  }
  const authorization = prepareX402AuthorizationFromPlanV1(plan.data, dependencies.nowSec);
  const placement = await dependencies.placements.prepare({
    id: policy.requestId, owner: policy.owner, offerCommitment: policy.offerCommitment,
    policyHash: commitment(policy) as Hash, programHash: plan.data.programHash,
    manifestHash: policy.merchantManifestHash, planHash: commitment(plan.data) as Hash,
    authorizationTemplateHash: commitment(authorization) as Hash,
    observedAtSec: dependencies.nowSec,
  });
  return { placement, authorization };
}
