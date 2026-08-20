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
    expect(html).toContain("10000 atomic · 0x2222222222222222222222222222222222222222");
    expect(html).toContain("Payment settled is not proof of delivery");
    expect(html).toContain("Merchant unregistered");
    expect(html).toContain("Product details were not supplied by the source");
    expect(html).not.toContain("Execute");
    if (offer.placement.kind === "direct-contract") throw new Error("Fixture must expose a remote endpoint");
    expect(html).toContain(offer.placement.endpoint);
  });

  it("shows the external listing's actual network", () => {
    const baseOffer = CommerceOfferV1Schema.parse({
      ...offer,
      payment: { ...offer.payment, chainId: 8453 },
    });
    const html = renderToStaticMarkup(<CommerceOfferDetails offer={baseOffer} observedAtSec={2_000_000_010} />);

    expect(html).toContain("Base · 8453");
    expect(html).not.toContain("X Layer · 196");
  });

  it("offers a bounded purchase intent only for a fresh supported resource", () => {
    const supported = CommerceOfferV1Schema.parse({
      ...offer,
      merchant: { ...offer.merchant, manifestHash: hash("4") },
      evidence: { ...offer.evidence,
        receiptRecipient: "0x3333333333333333333333333333333333333333" },
      eligibility: { status: "executable" },
    });
    const html = renderToStaticMarkup(
      <CommerceOfferDetails offer={supported} observedAtSec={2_000_000_010} />,
    );

    expect(html).toContain("Cobia-supported");
    expect(html).toContain("Pinned merchant and product");
    expect(html).toContain("Verified purchase intent");
    expect(html).toContain("Review and buy");
  });
});
