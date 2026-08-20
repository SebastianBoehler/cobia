import { isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import { commitment } from "./canonical";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Commerce URLs must use HTTPS",
});
const IdentifierSchema = z.string().trim().min(1).max(256);
const PositiveIntegerStringSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);

export const CommerceOfferBlockedReasonV1Schema = z.enum([
  "CHAIN_UNSUPPORTED",
  "ASSET_UNSUPPORTED",
  "EVIDENCE_UNSUPPORTED",
  "MERCHANT_UNREGISTERED",
  "OFFER_MALFORMED",
  "PII_REQUIRED",
  "PLACEMENT_UNSUPPORTED",
]);

export const CommerceOfferEligibilityV1Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("executable") }).strict(),
  z.object({
    status: z.literal("discovery-only"),
    blockedReason: CommerceOfferBlockedReasonV1Schema,
  }).strict(),
  z.object({
    status: z.literal("blocked"),
    blockedReason: CommerceOfferBlockedReasonV1Schema,
  }).strict(),
]);

const PlacementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("x402-exact"), endpoint: HttpsUrlSchema }).strict(),
  z.object({ kind: z.literal("ucp-checkout"), endpoint: HttpsUrlSchema }).strict(),
  z.object({
    kind: z.literal("direct-contract"),
    capabilityId: z.literal("commerce.order.place"),
    capabilityVersion: z.literal(1),
  }).strict(),
]);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const CommerceOfferV1Schema = z.object({
  version: z.literal(1),
  offerId: IdentifierSchema,
  source: z.object({
    protocol: z.enum(["x402-v2", "ucp-catalog"]),
    url: HttpsUrlSchema,
    adapterVersion: z.literal(1),
    fetchedAt: z.number().int().positive().safe(),
    responseHash: HashSchema,
    provenance: z.array(z.string().trim().min(1).max(1_024)).max(16),
  }).strict(),
  expiresAt: z.number().int().positive().safe(),
  merchant: z.object({
    id: IdentifierSchema,
    displayName: z.string().trim().min(1).max(200),
    payee: AddressSchema,
    manifestHash: HashSchema,
  }).strict(),
  product: z.object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    mimeType: z.string().trim().min(1).max(200).optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(5).optional(),
    commitment: HashSchema,
    descriptionHash: HashSchema,
    quantity: PositiveIntegerStringSchema,
    mediaHashes: z.array(HashSchema).max(16),
  }).strict(),
  payment: z.object({
    chainId: z.number().int().positive().safe(),
    scheme: z.literal("exact"),
    asset: AddressSchema,
    atomicAmount: PositiveIntegerStringSchema,
    maxTimeoutSec: z.number().int().min(1).max(604_800),
  }).strict(),
  placement: PlacementSchema,
  evidence: z.object({
    profile: z.enum(["onchain-order", "payment-settled"]),
    receiptRecipient: AddressSchema,
  }).strict(),
  eligibility: CommerceOfferEligibilityV1Schema,
}).strict().superRefine((offer, context) => {
  if (offer.expiresAt <= offer.source.fetchedAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Offer must expire after fetch" });
  }
  if (!sortedUnique(offer.source.provenance)) {
    context.addIssue({ code: "custom", path: ["source", "provenance"], message: "Provenance must be sorted and unique" });
  }
  if (!sortedUnique(offer.product.mediaHashes)) {
    context.addIssue({ code: "custom", path: ["product", "mediaHashes"], message: "Media hashes must be sorted and unique" });
  }
  if (offer.product.tags && !sortedUnique(offer.product.tags)) {
    context.addIssue({ code: "custom", path: ["product", "tags"], message: "Product tags must be sorted and unique" });
  }
  if (offer.eligibility.status === "executable" && offer.payment.chainId !== 196) {
    context.addIssue({ code: "custom", path: ["payment", "chainId"], message: "Executable offers require X Layer mainnet" });
  }
  if (offer.eligibility.status === "executable" && offer.payment.maxTimeoutSec > 900) {
    context.addIssue({ code: "custom", path: ["payment", "maxTimeoutSec"], message: "Executable offer timeout exceeds policy bound" });
  }
  if (offer.eligibility.status === "executable" && /^0x0{64}$/.test(offer.merchant.manifestHash)) {
    context.addIssue({ code: "custom", path: ["merchant", "manifestHash"], message: "Executable offers require a trusted merchant manifest" });
  }
  if (offer.eligibility.status === "executable" && /^0x0{40}$/.test(offer.evidence.receiptRecipient)) {
    context.addIssue({ code: "custom", path: ["evidence", "receiptRecipient"], message: "Executable offers require a bound receipt recipient" });
  }
  if (offer.eligibility.status === "executable" && offer.placement.kind === "ucp-checkout") {
    context.addIssue({ code: "custom", path: ["placement"], message: "UCP checkout is discovery only" });
  }
});

export type CommerceOfferV1 = z.infer<typeof CommerceOfferV1Schema>;
export type CommerceOfferEligibilityV1 = z.infer<typeof CommerceOfferEligibilityV1Schema>;

export function commerceOfferCommitmentV1(input: CommerceOfferV1): Hash {
  return commitment(CommerceOfferV1Schema.parse(input)) as Hash;
}
