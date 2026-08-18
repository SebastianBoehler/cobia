import { CommerceOfferV1Schema } from "@cobia/domain";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommerceOffers } from "./CommerceOffers";

const hash = (byte: string) => `0x${byte.repeat(64)}` as const;
const offer = CommerceOfferV1Schema.parse({
  version: 1,
  offerId: "x402:merchant.example:coffee",
  source: {
    protocol: "x402-v2",
    url: "https://bazaar.example/discovery/resources",
    adapterVersion: 1,
    fetchedAt: 2_000_000_000,
    responseHash: hash("1"),
    provenance: ["resource:https://merchant.example/api/coffee"],
  },
  expiresAt: 2_000_000_300,
  merchant: {
    id: "merchant.example", displayName: "Example Merchant",
    payee: "0x1111111111111111111111111111111111111111", manifestHash: hash("0"),
  },
  product: {
    id: "coffee", commitment: hash("2"), descriptionHash: hash("3"),
    quantity: "1", mediaHashes: [],
  },
  payment: {
    chainId: 196, scheme: "exact", asset: "0x2222222222222222222222222222222222222222",
    atomicAmount: "12500000", maxTimeoutSec: 60,
  },
  placement: { kind: "x402-exact", endpoint: "https://merchant.example/api/coffee" },
  evidence: {
    profile: "payment-settled", receiptRecipient: "0x0000000000000000000000000000000000000000",
  },
  eligibility: { status: "discovery-only", blockedReason: "MERCHANT_UNREGISTERED" },
});

describe("CommerceOffers", () => {
  it("shows exact payment, provenance, evidence, expiry, and eligibility", () => {
    const html = renderToStaticMarkup(<CommerceOffers offers={[offer]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Example Merchant");
    expect(html).toContain("12500000 atomic");
    expect(html).toContain("X Layer · chain 196");
    expect(html).toContain("Payment settlement evidence");
    expect(html).toContain("Discovery only");
    expect(html).toContain("Merchant unregistered");
    expect(html).toContain("bazaar.example");
    expect(html).toContain("Review offer");
  });

  it("links every immutable offer to commerce review rather than the DeFi composer", () => {
    const executable = CommerceOfferV1Schema.parse({
      ...offer,
      merchant: { ...offer.merchant, manifestHash: hash("4") },
      evidence: { ...offer.evidence, receiptRecipient: "0x3333333333333333333333333333333333333333" },
      eligibility: { status: "executable" },
    });
    const html = renderToStaticMarkup(<CommerceOffers offers={[executable]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Executable");
    expect(html).toContain("Review offer");
    expect(html).toContain("/commerce/offers/0x");
    expect(html).not.toContain("/intents/new");
    expect(offer.placement.kind).toBe("x402-exact");
    if (offer.placement.kind !== "x402-exact") throw new Error("Fixture must use x402 placement");
    expect(html).not.toContain(offer.placement.endpoint);
  });

  it("states the truthful empty case", () => {
    expect(renderToStaticMarkup(<CommerceOffers offers={[]} observedAtSec={2_000_000_000} />))
      .toContain("No commerce offers are currently indexed");
  });
});
