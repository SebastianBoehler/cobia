import { describe, expect, it } from "vitest";
import {
  CommerceOfferV1Schema,
  commerceOfferCommitmentV1,
} from "../src/index";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const address = (digit: string) => `0x${digit.repeat(40)}`;

const executableOffer = {
  version: 1 as const,
  offerId: "merchant:coffee-beans:1kg",
  source: {
    protocol: "x402-v2" as const,
    url: "https://merchant.example/.well-known/x402",
    adapterVersion: 1 as const,
    fetchedAt: 2_000_000_000,
    responseHash: hash("a"),
    provenance: ["bazaar:https://bazaar.example/discovery/resources"],
  },
  expiresAt: 2_000_000_300,
  merchant: {
    id: "merchant.example",
    displayName: "Example Merchant",
    payee: address("a"),
    manifestHash: hash("B"),
  },
  product: {
    id: "coffee-beans",
    commitment: hash("c"),
    descriptionHash: hash("d"),
    quantity: "1",
    mediaHashes: [hash("e")],
  },
  payment: {
    chainId: 196 as const,
    scheme: "exact" as const,
    asset: address("f"),
    atomicAmount: "12500000",
    maxTimeoutSec: 120,
  },
  placement: {
    kind: "x402-exact" as const,
    endpoint: "https://merchant.example/orders/coffee-beans",
  },
  evidence: {
    profile: "payment-settled" as const,
    receiptRecipient: address("1"),
  },
  eligibility: { status: "executable" as const },
};

describe("CommerceOfferV1", () => {
  it("canonicalizes an executable X Layer offer and commits every field", () => {
    const parsed = CommerceOfferV1Schema.parse(executableOffer);

    expect(parsed.merchant.payee).toBe(address("a"));
    expect(parsed.merchant.manifestHash).toBe(hash("b"));
    expect(commerceOfferCommitmentV1(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(commerceOfferCommitmentV1({
      ...parsed,
      payment: { ...parsed.payment, atomicAmount: "12500001" },
    })).not.toBe(commerceOfferCommitmentV1(parsed));
  });

  it("accepts discovery-only UCP catalog offers with a stable reason", () => {
    const parsed = CommerceOfferV1Schema.parse({
      ...executableOffer,
      source: { ...executableOffer.source, protocol: "ucp-catalog" },
      payment: { ...executableOffer.payment, chainId: 1 },
      placement: {
        kind: "ucp-checkout" as const,
        endpoint: "https://merchant.example/checkout",
      },
      eligibility: {
        status: "discovery-only" as const,
        blockedReason: "CHAIN_UNSUPPORTED" as const,
      },
    });

    expect(parsed.eligibility.status).toBe("discovery-only");
  });

  it("rejects executable non-X-Layer offers and unbound endpoints", () => {
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      payment: { ...executableOffer.payment, chainId: 1 },
    }).success).toBe(false);
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      placement: { ...executableOffer.placement, endpoint: "http://merchant.example/order" },
    }).success).toBe(false);
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      merchant: { ...executableOffer.merchant, manifestHash: hash("0") },
    }).success).toBe(false);
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      evidence: { ...executableOffer.evidence, receiptRecipient: address("0") },
    }).success).toBe(false);
  });

  it("rejects missing or contradictory blocked reasons", () => {
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      eligibility: { status: "blocked" },
    }).success).toBe(false);
    expect(CommerceOfferV1Schema.safeParse({
      ...executableOffer,
      eligibility: { status: "executable", blockedReason: "OFFER_MALFORMED" },
    }).success).toBe(false);
  });

  it("rejects dirty primitives, zero values, stale offers, and unknown keys", () => {
    const invalid = [
      { ...executableOffer, expiresAt: executableOffer.source.fetchedAt },
      { ...executableOffer, payment: { ...executableOffer.payment, atomicAmount: "0" } },
      { ...executableOffer, product: { ...executableOffer.product, quantity: "01" } },
      { ...executableOffer, merchant: { ...executableOffer.merchant, payee: "not-an-address" } },
      { ...executableOffer, hiddenAuthorization: "0xdead" },
    ];

    for (const offer of invalid) {
      expect(CommerceOfferV1Schema.safeParse(offer).success).toBe(false);
    }
  });
});
