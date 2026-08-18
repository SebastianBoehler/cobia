import { describe, expect, it } from "vitest";
import { parseX402PaymentRequiredV2, normalizeX402ResourceV1 } from "./x402-wire";

const hash = (byte: string) => `0x${byte.repeat(64)}` as const;
const merchant = "0x1111111111111111111111111111111111111111" as const;
const asset = "0x2222222222222222222222222222222222222222" as const;
const owner = "0x3333333333333333333333333333333333333333" as const;

const required = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: {
    url: "https://merchant.example/api/order/coffee",
    description: "One bag of coffee beans",
    mimeType: "application/json",
    serviceName: "Example Merchant",
  },
  accepts: [{
    scheme: "exact",
    network: "eip155:196",
    amount: "12500000",
    asset,
    payTo: merchant,
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", paymentFlow: "authorization" },
  }],
  extensions: {},
};

function header(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

describe("x402 v2 commerce wire", () => {
  it("parses the canonical PAYMENT-REQUIRED header", () => {
    const parsed = parseX402PaymentRequiredV2(header(required));

    expect(parsed.x402Version).toBe(2);
    expect(parsed.accepts[0]?.network).toBe("eip155:196");
  });

  it("normalizes one exact EIP-3009 requirement into an executable offer", () => {
    const offer = normalizeX402ResourceV1({
      paymentRequired: required,
      rawResponse: Buffer.from(JSON.stringify(required)),
      fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_060,
      sourceUrl: "https://bazaar.example/discovery/resources",
      merchantId: "merchant.example",
      manifestHash: hash("a"),
      productId: "coffee",
      productCommitment: hash("b"),
      receiptRecipient: owner,
    });

    expect(offer.payment).toMatchObject({ chainId: 196, atomicAmount: "12500000", asset });
    expect(offer.eligibility).toEqual({ status: "executable" });
    expect(offer.source.responseHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects malformed encodings, wrong versions, and oversized headers", () => {
    expect(() => parseX402PaymentRequiredV2("not base64!" )).toThrow(/base64/i);
    expect(() => parseX402PaymentRequiredV2(header({ ...required, x402Version: 1 }))).toThrow();
    expect(() => parseX402PaymentRequiredV2("e30=".padEnd(20_000, "A"))).toThrow(/size/i);
  });

  it("keeps unsupported networks and transfer methods discovery-only", () => {
    for (const acceptance of [
      { ...required.accepts[0], network: "eip155:1" },
      { ...required.accepts[0], extra: { assetTransferMethod: "permit2" } },
    ]) {
      const offer = normalizeX402ResourceV1({
        paymentRequired: { ...required, accepts: [acceptance] },
        rawResponse: Buffer.from(JSON.stringify({ ...required, accepts: [acceptance] })),
        fetchedAt: 2_000_000_000,
        expiresAt: 2_000_000_060,
        sourceUrl: "https://bazaar.example/discovery/resources",
        merchantId: "merchant.example",
        manifestHash: hash("a"),
        productId: "coffee",
        productCommitment: hash("b"),
        receiptRecipient: owner,
      });
      expect(offer.eligibility.status).not.toBe("executable");
    }
  });

  it("rejects missing payment and browser-authored placement endpoints", () => {
    expect(() => normalizeX402ResourceV1({
      paymentRequired: { ...required, accepts: [] },
      rawResponse: Buffer.from("{}"),
      fetchedAt: 2_000_000_000,
      expiresAt: 2_000_000_060,
      sourceUrl: "https://bazaar.example/discovery/resources",
      merchantId: "merchant.example",
      manifestHash: hash("a"),
      productId: "coffee",
      productCommitment: hash("b"),
      receiptRecipient: owner,
    })).toThrow(/payment/i);
  });
});
