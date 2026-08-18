import { CommerceOfferV1Schema, commerceOfferCommitmentV1 } from "@cobia/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommerceOfferRepository } from "./commerce-offers";
import { createCommercePlacementRepository } from "./commerce-placements";
import { startIntegrationDatabase } from "./integration-database";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111";
const placementId = "550e8400-e29b-41d4-a716-446655440077";
const nowSec = 2_000_000_000;
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "x402:merchant.example:resource", expiresAt: nowSec + 300,
  source: {
    protocol: "x402-v2", url: "https://bazaar.example/resources", adapterVersion: 1,
    fetchedAt: nowSec, responseHash: hash("1"), provenance: ["resource:https://merchant.example/api"],
  },
  merchant: { id: "merchant.example", displayName: "Merchant", payee: owner, manifestHash: hash("2") },
  product: { id: "resource", commitment: hash("3"), descriptionHash: hash("4"), quantity: "1", mediaHashes: [] },
  payment: {
    chainId: 196, scheme: "exact", asset: "0x2222222222222222222222222222222222222222",
    atomicAmount: "10000", maxTimeoutSec: 60,
  },
  placement: { kind: "x402-exact", endpoint: "https://merchant.example/api" },
  evidence: { profile: "payment-settled", receiptRecipient: owner },
  eligibility: { status: "executable" },
});
const prepared = {
  id: placementId, owner, offerCommitment: commerceOfferCommitmentV1(offer),
  policyHash: hash("5"), programHash: hash("6"), manifestHash: hash("2"),
  planHash: hash("7"), authorizationTemplateHash: hash("8"), observedAtSec: nowSec,
};

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
  await createCommerceOfferRepository(db()).store(offer);
});
afterAll(async () => { await database?.close(); });

describe("commerce placement repository", () => {
  it("prepares an immutable owner-bound placement idempotently", async () => {
    const repository = createCommercePlacementRepository(db());
    const first = await repository.prepare(prepared);
    const second = await repository.prepare(prepared);
    expect(first).toMatchObject({ id: placementId, state: "prepared", sequence: 1, owner });
    expect(second).toEqual(first);
    await expect(repository.prepare({ ...prepared, programHash: hash("9") }))
      .rejects.toThrow("conflicts");
  });

  it("allows exactly one concurrent transition and enforces owner/state", async () => {
    const repository = createCommercePlacementRepository(db());
    await repository.prepare(prepared);
    const transition = {
      placementId, owner, expectedState: "prepared" as const, state: "authorizing" as const,
      authorizationHash: hash("a"), observedAtSec: nowSec + 1,
    };
    const results = await Promise.allSettled([
      repository.append(transition), repository.append(transition),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(repository.append({ ...transition, owner: offer.payment.asset }))
      .rejects.toThrow("owner");
  });

  it("retains exact hashes through submitted and immutable terminal evidence", async () => {
    const repository = createCommercePlacementRepository(db());
    const current = await repository.read(placementId);
    expect(current?.state).toBe("authorizing");
    await repository.append({
      placementId, owner, expectedState: "authorizing", state: "submitted",
      authorizationHash: hash("a"), transactionHash: hash("b"), observedAtSec: nowSec + 2,
    });
    const confirmed = await repository.append({
      placementId, owner, expectedState: "submitted", state: "confirmed",
      authorizationHash: hash("a"), transactionHash: hash("b"), evidenceHash: hash("c"),
      observedAtSec: nowSec + 3,
    });
    expect(confirmed).toMatchObject({
      state: "confirmed", sequence: 4, authorizationHash: hash("a"),
      transactionHash: hash("b"), evidenceHash: hash("c"),
    });
    await expect(repository.append({
      placementId, owner, expectedState: "confirmed", state: "rejected",
      rejectionCode: "PAYMENT_SETTLEMENT_REORGED", observedAtSec: nowSec + 4,
    })).rejects.toThrow("transition");
  });
});
