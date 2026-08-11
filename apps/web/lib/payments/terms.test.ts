import { describe, expect, it } from "vitest";
import {
  PaymentTermsSchema,
  buildPaymentTerms,
  hashPaymentTerms,
  paymentTermsToChargeOptions,
} from "./terms";

const quote = {
  quoteId: `0x${"ab".repeat(32)}` as const,
  priceAtomic: "100000",
};
const solver = "0x2222222222222222222222222222222222222222";
const treasury = "0x3333333333333333333333333333333333333333";
const issuedAt = 1_999_999_700;

function terms() {
  return buildPaymentTerms({
    quote,
    solver,
    treasury,
    realm: "pay.cobia.example",
    issuedAt,
    cutoff: 2_000_000_000,
  });
}

describe("payment terms", () => {
  it("builds the exact supported reveal agreement", () => {
    expect(terms()).toEqual({
      version: 1,
      realm: "pay.cobia.example",
      paymentChainId: 1952,
      currency: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c",
      decimals: 6,
      amount: "100000",
      recipient: solver,
      externalId: quote.quoteId,
      feePayer: true,
      splits: [{ amount: "10000", recipient: treasury, memo: "cobia-platform" }],
      issuedAt,
      expiresAt: 2_000_000_000,
    });
  });

  it("rejects a selected quote with any other price", () => {
    expect(() => buildPaymentTerms({
      quote: { ...quote, priceAtomic: "99999" },
      solver,
      treasury,
      realm: "pay.cobia.example",
      issuedAt,
      cutoff: 2_000_000_000,
    })).toThrow();
  });

  it.each([
    ["stale", issuedAt, issuedAt],
    ["over 300 seconds", issuedAt, issuedAt + 301],
    ["outside RFC 3339", 253_402_300_500, 253_402_300_800],
    ["unrepresentable safe integer", Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
  ])("rejects a %s cutoff", (_name, issued, cutoff) => {
    expect(() => buildPaymentTerms({
      quote,
      solver,
      treasury,
      realm: "pay.cobia.example",
      issuedAt: issued,
      cutoff,
    })).toThrow();
  });

  it("accepts the maximum RFC-3339 timestamp at the 300-second boundary", () => {
    const value = buildPaymentTerms({
      quote,
      solver,
      treasury,
      realm: "pay.cobia.example",
      issuedAt: 253_402_300_499,
      cutoff: 253_402_300_799,
    });

    expect(value.issuedAt).toBe(253_402_300_499);
    expect(paymentTermsToChargeOptions(value).expires).toBe("9999-12-31T23:59:59.000Z");
  });

  it.each([
    ["version", (value: Record<string, unknown>) => { value.version = 2; }],
    ["payment chain", (value: Record<string, unknown>) => { value.paymentChainId = 196; }],
    ["currency", (value: Record<string, unknown>) => { value.currency = "0x1111111111111111111111111111111111111111"; }],
    ["decimals", (value: Record<string, unknown>) => { value.decimals = 18; }],
    ["amount", (value: Record<string, unknown>) => { value.amount = "100001"; }],
    ["fee payer", (value: Record<string, unknown>) => { value.feePayer = false; }],
    ["issued at", (value: Record<string, unknown>) => { delete value.issuedAt; }],
    ["split amount", (value: Record<string, unknown>) => { (value.splits as Array<Record<string, unknown>>)[0].amount = "9999"; }],
    ["split memo", (value: Record<string, unknown>) => { (value.splits as Array<Record<string, unknown>>)[0].memo = "other"; }],
    ["split count", (value: Record<string, unknown>) => { value.splits = []; }],
    ["extra field", (value: Record<string, unknown>) => { value.unexpected = true; }],
  ])("rejects a mutated fixed %s", (_name, mutate) => {
    const mutated = structuredClone(terms()) as unknown as Record<string, unknown>;
    mutate(mutated);
    expect(PaymentTermsSchema.safeParse(mutated).success).toBe(false);
  });

  it("hashes every variable agreement field deterministically", () => {
    const expected = "0x01a19296944e696e078ecc2aa61a75ee65280389e979759381889f4616ba9b21";
    expect(hashPaymentTerms(terms())).toBe(expected);

    for (const mutation of [
      { realm: "other.cobia.example" },
      { recipient: "0x4444444444444444444444444444444444444444" },
      { externalId: `0x${"cd".repeat(32)}` },
      { issuedAt: issuedAt + 1 },
      { expiresAt: 1_999_999_999 },
    ]) {
      expect(hashPaymentTerms({ ...terms(), ...mutation })).not.toBe(expected);
    }
  });

  it("maps terms to an MPP charge with explicit challenge expiry", () => {
    expect(paymentTermsToChargeOptions(terms())).toEqual({
      amount: "100000",
      currency: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c",
      recipient: solver,
      description: "Reveal Cobia deterministic Aave quote",
      externalId: quote.quoteId,
      expires: "2033-05-18T03:33:20.000Z",
      methodDetails: {
        chainId: 1952,
        feePayer: true,
        splits: [{ amount: "10000", recipient: treasury, memo: "cobia-platform" }],
      },
    });
  });
});
