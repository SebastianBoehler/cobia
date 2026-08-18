import { CommerceOfferV1Schema, commerceOfferCommitmentV1 } from "@cobia/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommerceOfferRepository } from "./commerce-offers";
import { startIntegrationDatabase } from "./integration-database";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const hash = (byte: string) => `0x${byte.repeat(64)}` as const;
const nowSec = 2_000_000_000;
const offer = CommerceOfferV1Schema.parse({
  version: 1,
  offerId: "x402:merchant.example:coffee",
  source: {
    protocol: "x402-v2",
    url: "https://bazaar.example/discovery/resources",
    adapterVersion: 1,
    fetchedAt: nowSec,
    responseHash: hash("1"),
    provenance: ["resource:https://merchant.example/api/coffee"],
  },
  expiresAt: nowSec + 300,
  merchant: {
    id: "merchant.example",
    displayName: "Example Merchant",
    payee: "0x1111111111111111111111111111111111111111",
    manifestHash: hash("0"),
  },
  product: {
    id: "coffee",
    commitment: hash("2"),
    descriptionHash: hash("3"),
    quantity: "1",
    mediaHashes: [],
  },
  payment: {
    chainId: 196,
    scheme: "exact",
    asset: "0x2222222222222222222222222222222222222222",
    atomicAmount: "12500000",
    maxTimeoutSec: 60,
  },
  placement: { kind: "x402-exact", endpoint: "https://merchant.example/api/coffee" },
  evidence: {
    profile: "payment-settled",
    receiptRecipient: "0x0000000000000000000000000000000000000000",
  },
  eligibility: { status: "discovery-only", blockedReason: "MERCHANT_UNREGISTERED" },
});

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => { database = await startIntegrationDatabase(); });
afterAll(async () => { await database?.close(); });

describe("commerce offer repository", () => {
  it("stores immutable canonical offers idempotently by commitment", async () => {
    const repository = createCommerceOfferRepository(db());
    const first = await repository.store(offer);
    const second = await repository.store(offer);

    expect(first.commitment).toBe(commerceOfferCommitmentV1(offer));
    expect(second.commitment).toBe(first.commitment);
    expect(await repository.get(first.commitment)).toEqual(offer);
  });

  it("creates a distinct snapshot after any executable field changes", async () => {
    const repository = createCommerceOfferRepository(db());
    const changed = CommerceOfferV1Schema.parse({
      ...offer,
      payment: { ...offer.payment, atomicAmount: "12500001" },
      source: { ...offer.source, responseHash: hash("4") },
    });
    const stored = await repository.store(changed);

    expect(stored.commitment).not.toBe(commerceOfferCommitmentV1(offer));
    expect(await repository.get(stored.commitment)).toEqual(changed);
  });

  it("lists only unexpired offers with stable ordering", async () => {
    const repository = createCommerceOfferRepository(db());
    const later = CommerceOfferV1Schema.parse({
      ...offer,
      offerId: "x402:merchant.example:tea",
      expiresAt: nowSec + 600,
      source: { ...offer.source, responseHash: hash("5") },
    });
    await repository.store(offer);
    await repository.store(later);

    const current = await repository.listCurrent(nowSec + 301, 20);
    expect(current.map(({ offerId }) => offerId)).toEqual([later.offerId]);
  });

  it("rejects invalid commitments instead of performing a broad query", async () => {
    await expect(createCommerceOfferRepository(db()).get("not-a-hash")).rejects.toThrow();
  });
});
