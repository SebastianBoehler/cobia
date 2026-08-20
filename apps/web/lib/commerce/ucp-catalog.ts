import { CommerceOfferV1Schema, canonicalJson, type CommerceOfferV1 } from "@cobia/domain";
import { bytesToHex, isAddress, keccak256, stringToHex, type Address, type Hash } from "viem";
import { z } from "zod";

const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "UCP endpoints must use HTTPS",
});
const ServiceSchema = z.object({
  version: z.string().regex(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/),
  transport: z.enum(["rest", "mcp"]),
  endpoint: HttpsUrlSchema,
}).passthrough();
const CapabilitySchema = z.object({
  version: z.string().regex(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/),
}).passthrough();

const UcpProfileSchema = z.object({
  ucp: z.object({
    version: z.string().regex(/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/),
    services: z.record(z.string(), z.array(ServiceSchema)),
    capabilities: z.record(z.string(), z.array(CapabilitySchema)),
    payment_handlers: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  keys: z.array(z.unknown()).optional(),
}).passthrough();

export type ParsedUcpProfileV1 = {
  version: string;
  catalogEndpoint: string;
  transport: "rest" | "mcp";
};

export function parseUcpProfileV1(input: unknown): ParsedUcpProfileV1 {
  const profile = UcpProfileSchema.parse(input);
  const catalog = profile.ucp.capabilities["dev.ucp.shopping.catalog.search"];
  if (!catalog?.length) throw new Error("UCP profile does not declare catalog search");
  const service = profile.ucp.services["dev.ucp.shopping"]?.find(
    ({ version }) => catalog.some((capability) => capability.version === version),
  );
  if (!service) throw new Error("UCP profile has no compatible catalog service");
  return {
    version: profile.ucp.version,
    catalogEndpoint: service.endpoint,
    transport: service.transport,
  };
}

const ProductSchema = z.object({
  id: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).optional(),
  price: z.object({
    amount: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/),
    currency: z.string().regex(/^[A-Z]{3,8}$/),
  }).strict(),
}).strict();

function decimalToAtomic(value: string, decimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("Catalog price exceeds configured precision");
  const atomic = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (atomic <= 0n) throw new Error("Catalog price must be positive");
  return atomic.toString();
}

type NormalizeUcpInput = {
  product: unknown;
  rawResponse: Uint8Array;
  profileUrl: string;
  catalogEndpoint: string;
  fetchedAt: number;
  expiresAt: number;
  merchantId: string;
  merchantName: string;
  payee: Address;
  manifestHash: Hash;
  paymentAsset: Address;
  paymentDecimals: number;
  receiptRecipient: Address;
};

export function normalizeUcpCatalogProductV1(input: NormalizeUcpInput): CommerceOfferV1 {
  if (!isAddress(input.payee) || !isAddress(input.paymentAsset)) throw new Error("Invalid merchant payment mapping");
  const product = ProductSchema.parse(input.product);
  const productCommitment = keccak256(stringToHex(canonicalJson(product)));
  return CommerceOfferV1Schema.parse({
    version: 1,
    offerId: `ucp:${input.merchantId}:${product.id}`,
    source: {
      protocol: "ucp-catalog",
      url: input.profileUrl,
      adapterVersion: 1,
      fetchedAt: input.fetchedAt,
      responseHash: keccak256(bytesToHex(input.rawResponse)),
      provenance: [`catalog:${input.catalogEndpoint}`],
    },
    expiresAt: input.expiresAt,
    merchant: {
      id: input.merchantId,
      displayName: input.merchantName,
      payee: input.payee,
      manifestHash: input.manifestHash,
    },
    product: {
      id: product.id,
      name: product.title,
      ...(product.description ? { description: product.description } : {}),
      commitment: productCommitment,
      descriptionHash: keccak256(stringToHex(product.description ?? product.title)),
      quantity: "1",
      mediaHashes: [],
    },
    payment: {
      chainId: 196,
      scheme: "exact",
      asset: input.paymentAsset,
      atomicAmount: decimalToAtomic(product.price.amount, input.paymentDecimals),
      maxTimeoutSec: 300,
    },
    placement: { kind: "ucp-checkout", endpoint: input.catalogEndpoint },
    evidence: { profile: "payment-settled", receiptRecipient: input.receiptRecipient },
    eligibility: { status: "discovery-only", blockedReason: "PLACEMENT_UNSUPPORTED" },
  });
}
