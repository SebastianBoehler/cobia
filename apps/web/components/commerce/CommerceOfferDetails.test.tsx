import { CommerceOfferV1Schema } from "@cobia/domain";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommerceOfferDetails } from "./CommerceOfferDetails";

const hash = (byte: string) => `0x${byte.repeat(64)}` as const;
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "x402:merchant.example:api", expiresAt: 2_000_000_300,
  source: {
    protocol: "x402-v2", url: "https://bazaar.example/resources", adapterVersion: 1,
    fetchedAt: 2_000_000_000, responseHash: hash("1"), provenance: ["resource:https://merchant.example/api"],
  },
  merchant: {
    id: "merchant.example", displayName: "Example Merchant",
    payee: "0x1111111111111111111111111111111111111111", manifestHash: hash("0"),
  },
  product: { id: "api", commitment: hash("2"), descriptionHash: hash("3"), quantity: "1", mediaHashes: [] },
  payment: {
    chainId: 196, scheme: "exact", asset: "0x2222222222222222222222222222222222222222",
    atomicAmount: "10000", maxTimeoutSec: 60,
  },
  placement: { kind: "x402-exact", endpoint: "https://merchant.example/api" },
  evidence: { profile: "payment-settled", receiptRecipient: "0x0000000000000000000000000000000000000000" },
  eligibility: { status: "discovery-only", blockedReason: "MERCHANT_UNREGISTERED" },
});

describe("commerce offer details", () => {
  it("explains exact payment and why a discovered offer cannot execute", () => {
    const html = renderToStaticMarkup(<CommerceOfferDetails offer={offer} observedAtSec={2_000_000_010} />);
    expect(html).toContain("Example Merchant");
    expect(html).toContain("10000 atomic units");
    expect(html).toContain("Payment settled is not proof of delivery");
    expect(html).toContain("Merchant unregistered");
    expect(html).not.toContain("Execute");
    if (offer.placement.kind === "direct-contract") throw new Error("Fixture must expose a remote endpoint");
    expect(html).not.toContain(offer.placement.endpoint);
  });
});
