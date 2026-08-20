import {
  CommerceOfferV1Schema,
  canonicalJson,
  type CommerceOfferV1,
} from "@cobia/domain";
import { bytesToHex, isAddress, keccak256, stringToHex, type Address, type Hash } from "viem";
import { z } from "zod";

const MAX_PAYMENT_HEADER_BYTES = 12_288;
const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:");

export const X402PaymentRequirementV2Schema = z.object({
  scheme: z.string().min(1).max(64),
  network: z.string().regex(/^eip155:[1-9][0-9]*$/),
  amount: z.string().regex(/^[1-9][0-9]*$/).max(78),
  asset: AddressSchema,
  payTo: AddressSchema,
  maxTimeoutSeconds: z.number().int().min(1).max(604_800),
  extra: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const X402PaymentRequiredV2Schema = z.object({
  x402Version: z.literal(2),
  error: z.string().max(500).optional(),
  resource: z.object({
    url: HttpsUrlSchema,
    description: z.string().max(2_000).optional(),
    mimeType: z.string().max(200).optional(),
    serviceName: z.string().max(32).optional(),
    tags: z.array(z.string().max(32)).max(32).optional(),
    iconUrl: z.url().max(2_048).optional(),
  }).strict(),
  accepts: z.array(X402PaymentRequirementV2Schema).max(32),
  extensions: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type X402PaymentRequiredV2 = z.infer<typeof X402PaymentRequiredV2Schema>;

export const X402BazaarResourcesV2Schema = z.object({
  x402Version: z.literal(2),
  items: z.array(z.object({
    resource: HttpsUrlSchema,
    type: z.literal("http"),
    x402Version: z.literal(2),
    accepts: z.array(X402PaymentRequirementV2Schema).min(1).max(32),
    lastUpdated: z.string().datetime(),
    metadata: z.object({ description: z.string().max(2_000).optional() }).passthrough().optional(),
    description: z.string().max(2_000).optional(),
    serviceName: z.string().max(32).optional(),
    tags: z.array(z.string().max(32)).max(32).optional(),
    iconUrl: z.url().max(2_048).optional(),
  }).passthrough()).max(100),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type X402BazaarResourcesV2 = z.infer<typeof X402BazaarResourcesV2Schema>;

export function parseX402BazaarResourcesV2(input: unknown): X402BazaarResourcesV2 {
  return X402BazaarResourcesV2Schema.parse(input);
}

function decodeCanonicalBase64(input: string): Uint8Array {
  if (input.length > Math.ceil(MAX_PAYMENT_HEADER_BYTES * 4 / 3) + 4) {
    throw new Error("PAYMENT-REQUIRED header exceeds size limit");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input) || input.length % 4 !== 0) {
    throw new Error("PAYMENT-REQUIRED header is not canonical base64");
  }
  const bytes = Buffer.from(input, "base64");
  if (bytes.byteLength > MAX_PAYMENT_HEADER_BYTES || bytes.toString("base64") !== input) {
    throw new Error("PAYMENT-REQUIRED header has invalid base64 or size");
  }
  return bytes;
}

export function parseX402PaymentRequiredV2(header: string): X402PaymentRequiredV2 {
  const bytes = decodeCanonicalBase64(header);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("PAYMENT-REQUIRED header contains invalid JSON");
  }
  return X402PaymentRequiredV2Schema.parse(parsed);
}

type NormalizeX402Input = {
  paymentRequired: unknown;
  rawResponse: Uint8Array;
  fetchedAt: number;
  expiresAt: number;
  sourceUrl: string;
  merchantId: string;
  manifestHash: Hash;
  productId: string;
  productCommitment: Hash;
  receiptRecipient: Address;
  merchantRegistered: boolean;
  merchantDisplayName?: string;
};

export function normalizeX402ResourceV1(input: NormalizeX402Input): CommerceOfferV1 {
  const required = X402PaymentRequiredV2Schema.parse(input.paymentRequired);
  const accepted = required.accepts[0];
  if (!accepted) throw new Error("x402 resource has no payment requirement");

  const chainId = Number(accepted.network.slice("eip155:".length));
  const transferMethod = accepted.extra?.assetTransferMethod;
  const paymentFlow = accepted.extra?.paymentFlow;
  const executable = input.merchantRegistered && accepted.scheme === "exact" && [196, 8453].includes(chainId) &&
    accepted.maxTimeoutSeconds <= 3_600 &&
    (transferMethod === undefined || transferMethod === "eip3009") &&
    (paymentFlow === undefined || paymentFlow === "authorization");
  const blockedReason = !input.merchantRegistered
    ? "MERCHANT_UNREGISTERED"
    : ![196, 8453].includes(chainId)
    ? "CHAIN_UNSUPPORTED"
    : accepted.scheme !== "exact" || accepted.maxTimeoutSeconds > 3_600 || transferMethod === "permit2" ||
      (paymentFlow !== undefined && paymentFlow !== "authorization")
      ? "PLACEMENT_UNSUPPORTED"
      : "ASSET_UNSUPPORTED";
  const description = required.resource.description ?? required.resource.url;
  const productName = required.resource.serviceName ?? new URL(required.resource.url).pathname.split("/")
    .filter((part) => part && !part.startsWith(":"))
    .at(-1);

  return CommerceOfferV1Schema.parse({
    version: 1,
    offerId: `x402:${input.merchantId}:${input.productId}`,
    source: {
      protocol: "x402-v2",
      url: input.sourceUrl,
      adapterVersion: 1,
      fetchedAt: input.fetchedAt,
      responseHash: keccak256(bytesToHex(input.rawResponse)),
      provenance: [`resource:${required.resource.url}`],
    },
    expiresAt: input.expiresAt,
    merchant: {
      id: input.merchantId,
      displayName: input.merchantDisplayName ?? required.resource.serviceName ?? input.merchantId,
      payee: accepted.payTo,
      manifestHash: input.manifestHash,
    },
    product: {
      id: input.productId,
      ...(productName ? { name: productName.replaceAll("-", " ").replaceAll("_", " ") } : {}),
      ...(required.resource.description ? { description: required.resource.description } : {}),
      ...(required.resource.mimeType ? { mimeType: required.resource.mimeType } : {}),
      ...(required.resource.tags?.length
        ? { tags: [...new Set(required.resource.tags)].sort().slice(0, 5) }
        : {}),
      commitment: input.productCommitment,
      descriptionHash: keccak256(stringToHex(description)),
      quantity: "1",
      mediaHashes: [],
    },
    payment: {
      chainId,
      scheme: "exact",
      asset: accepted.asset,
      atomicAmount: accepted.amount,
      maxTimeoutSec: accepted.maxTimeoutSeconds,
    },
    placement: { kind: "x402-exact", endpoint: required.resource.url },
    evidence: { profile: "payment-settled", receiptRecipient: input.receiptRecipient },
    eligibility: executable
      ? { status: "executable" }
      : { status: "discovery-only", blockedReason },
  });
}

export function x402PaymentRequiredCommitmentV1(input: X402PaymentRequiredV2): Hash {
  const { extensions: _extensions, ...paymentTerms } = X402PaymentRequiredV2Schema.parse(input);
  return keccak256(stringToHex(canonicalJson(paymentTerms)));
}
