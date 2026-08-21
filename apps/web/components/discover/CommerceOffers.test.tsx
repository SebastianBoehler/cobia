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
const executableOffer = CommerceOfferV1Schema.parse({
  ...offer,
  merchant: { ...offer.merchant, manifestHash: hash("4") },
  evidence: { ...offer.evidence, receiptRecipient: "0x3333333333333333333333333333333333333333" },
  eligibility: { status: "executable" },
});

describe("CommerceOffers", () => {
  it("shows exact payment, provenance, evidence, expiry, and eligibility for supported offers", () => {
    const html = renderToStaticMarkup(<CommerceOffers offers={[executableOffer]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Example Merchant");
    expect(html).toContain("12500000 atomic · 0x2222222222222222222222222222222222222222");
    expect(html).toContain("X Layer · chain 196");
    expect(html).toContain("Payment settlement evidence");
    expect(html).toContain("Executable");
    expect(html).toContain("bazaar.example");
    expect(html).toContain("Review offer");
  });

  it("labels unsupported Base listings accurately without implying X Layer execution", () => {
    const baseOffer = CommerceOfferV1Schema.parse({ ...offer, payment: { ...offer.payment, chainId: 8453 } });
    const html = renderToStaticMarkup(<CommerceOffers offers={[baseOffer]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Base · chain 8453");
    expect(html).not.toContain("X Layer · chain 8453");
    expect(html).not.toContain("Executable");
  });

  it("keeps a long marketplace scan compact until the user asks for more", () => {
    const offers = Array.from({ length: 7 }, (_, index) => CommerceOfferV1Schema.parse({
      ...executableOffer,
      offerId: `x402:merchant.example:resource-${index}`,
      product: { ...executableOffer.product, id: `resource-${index}` },
    }));
    const html = renderToStaticMarkup(<CommerceOffers offers={offers} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Show 1 more offer");
    expect(html).toContain("<details");
  });

  it("links every immutable offer to commerce review rather than the DeFi composer", () => {
    const html = renderToStaticMarkup(<CommerceOffers offers={[executableOffer]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Executable");
    expect(html).toContain("Review offer");
    expect(html).toContain("/commerce/offers/0x");
    expect(html).not.toContain("/intents/new");
    expect(offer.placement.kind).toBe("x402-exact");
    if (offer.placement.kind !== "x402-exact") throw new Error("Fixture must use x402 placement");
    expect(html).not.toContain(offer.placement.endpoint);
  });

  it("does not advertise an expired executable offer as purchasable", () => {
    const html = renderToStaticMarkup(
      <CommerceOffers offers={[executableOffer]} observedAtSec={executableOffer.expiresAt} />,
    );

    expect(html).toContain("No supported paid resources are available yet");
    expect(html).not.toContain("Review offer");
    expect(html).not.toContain("Example Merchant");
  });

  it("states the truthful empty case", () => {
    expect(renderToStaticMarkup(<CommerceOffers offers={[]} observedAtSec={2_000_000_000} />))
      .toContain("No supported paid resources are available yet");
  });

  it("keeps unsupported public listings in a details-only external index", () => {
    const html = renderToStaticMarkup(<CommerceOffers offers={[offer]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("No supported paid resources are available yet");
    expect(html).toContain("External x402 index");
    expect(html).toContain("Example Merchant");
    expect(html).toContain("View details");
    expect(html).not.toContain("Executable");
  });

  it("shows each external resource endpoint only once", () => {
    const duplicate = CommerceOfferV1Schema.parse({
      ...offer,
      offerId: "x402:merchant.example:coffee-alternative",
      payment: { ...offer.payment, atomicAmount: "13000000" },
    });
    const html = renderToStaticMarkup(<CommerceOffers offers={[offer, duplicate]} observedAtSec={2_000_000_000} />);

    expect(html.match(/<article>/g) ?? []).toHaveLength(1);
  });

  it("shows source-bound product details and a readable supported-token price", () => {
    const detailed = CommerceOfferV1Schema.parse({
      ...executableOffer,
      product: {
        ...executableOffer.product,
        name: "Weather forecast API",
        description: "A seven-day forecast delivered as JSON.",
        mimeType: "application/json",
      },
      payment: {
        ...executableOffer.payment,
        asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      },
    });
    const html = renderToStaticMarkup(<CommerceOffers offers={[detailed]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Weather forecast API");
    expect(html).toContain("A seven-day forecast delivered as JSON.");
    expect(html).toContain("12.5 USDt0");
    expect(html).toContain("Example Merchant");
  });

  it("uses the resource name instead of a dynamic path parameter", () => {
    const parameterized = CommerceOfferV1Schema.parse({
      ...offer,
      placement: { kind: "x402-exact", endpoint: "https://merchant.example/api/native-balance/:address" },
    });
    const html = renderToStaticMarkup(<CommerceOffers offers={[parameterized]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Native balance");
    expect(html).not.toContain("><h3>:address</h3>");
  });
});
