import { describe, expect, it } from "vitest";
import { normalizeUcpCatalogProductV1, parseUcpProfileV1 } from "./ucp-catalog";

const hash = (byte: string) => `0x${byte.repeat(64)}` as const;
const merchant = "0x1111111111111111111111111111111111111111" as const;
const asset = "0x2222222222222222222222222222222222222222" as const;
const owner = "0x3333333333333333333333333333333333333333" as const;

const profile = {
  ucp: {
    version: "2026-04-08",
    services: {
      "dev.ucp.shopping": [{
        version: "2026-04-08",
        transport: "rest",
        endpoint: "https://merchant.example/ucp/v1",
      }],
    },
    capabilities: {
      "dev.ucp.shopping.catalog.search": [{ version: "2026-04-08" }],
      "dev.ucp.shopping.checkout": [{ version: "2026-04-08" }],
    },
    payment_handlers: {},
  },
  keys: [],
};

describe("UCP catalog commerce wire", () => {
  it("accepts a profile with a declared catalog search capability", () => {
    expect(parseUcpProfileV1(profile)).toMatchObject({
      version: "2026-04-08",
      catalogEndpoint: "https://merchant.example/ucp/v1",
    });
  });

  it("rejects profiles that only expose checkout or unsafe endpoints", () => {
    const noCatalog = {
      ...profile,
      ucp: { ...profile.ucp, capabilities: { "dev.ucp.shopping.checkout": [{ version: "2026-04-08" }] } },
    };
    expect(() => parseUcpProfileV1(noCatalog)).toThrow(/catalog/i);
    expect(() => parseUcpProfileV1({
      ...profile,
      ucp: {
        ...profile.ucp,
        services: { "dev.ucp.shopping": [{ ...profile.ucp.services["dev.ucp.shopping"][0], endpoint: "http://127.0.0.1" }] },
      },
    })).toThrow(/https/i);
  });

  it("normalizes catalog product data but keeps UCP checkout non-executable", () => {
    const offer = normalizeUcpCatalogProductV1({
      product: {
        id: "coffee",
        title: "One bag of coffee beans",
        description: "Freshly roasted",
        price: { amount: "12.50", currency: "USD" },
      },
      rawResponse: Buffer.from("catalog-response"),
      profileUrl: "https://merchant.example/.well-known/ucp",
      catalogEndpoint: "https://merchant.example/ucp/v1",
      fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
      merchantId: "merchant.example",
      merchantName: "Example Merchant",
      payee: merchant,
      manifestHash: hash("a"),
      paymentAsset: asset,
      paymentDecimals: 2,
      receiptRecipient: owner,
    });

    expect(offer.product.id).toBe("coffee");
    expect(offer.eligibility).toEqual({ status: "discovery-only", blockedReason: "PLACEMENT_UNSUPPORTED" });
  });

  it("rejects floating-point values, checkout envelopes, and missing product identity", () => {
    const base = {
      rawResponse: Buffer.from("catalog-response"),
      profileUrl: "https://merchant.example/.well-known/ucp",
      catalogEndpoint: "https://merchant.example/ucp/v1",
      fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
      merchantId: "merchant.example",
      merchantName: "Example Merchant",
      payee: merchant,
      manifestHash: hash("a"),
      paymentAsset: asset,
      paymentDecimals: 2,
      receiptRecipient: owner,
    };
    for (const product of [
      { id: "coffee", title: "Coffee", price: { amount: 12.5, currency: "USD" } },
      { checkout: { id: "checkout-1" } },
      { title: "Coffee", price: { amount: "12.50", currency: "USD" } },
    ]) {
      expect(() => normalizeUcpCatalogProductV1({ ...base, product })).toThrow();
    }
  });
});
