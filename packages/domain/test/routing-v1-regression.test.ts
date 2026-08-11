import { describe, expect, it } from "vitest";
import {
  PersistedBundleSchema,
  PersistedRouteQuoteSchema,
  PersistedSnapshotSchema,
  PersistedStablecoinPolicySchema,
  RouteQuoteSchema,
  commitment,
} from "../src/index";
import { policy, signedBundle, snapshot } from "./verification-fixtures";

describe("persisted V1 routing regression", () => {
  it("keeps the existing policy and snapshot envelopes and commitments unchanged", () => {
    expect(PersistedStablecoinPolicySchema.parse(policy)).toEqual(policy);
    expect(PersistedSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(commitment(policy)).toBe(
      "0x754355e046dcbd0c286267e77dc7449c5f11829d9ed976da6545f25dfb8c3879",
    );
    expect(commitment(snapshot)).toBe(
      "0x9fc6fdd109f7379a75ce367a5567c5e37deb30eb5b2631c25af6825d750f7605",
    );
  });

  it("keeps the existing signed bundle envelope and commitment unchanged", async () => {
    const bundle = await signedBundle();
    expect(PersistedBundleSchema.parse(bundle)).toEqual(bundle);
    expect(commitment(bundle)).toBe(
      "0xcda01d0a245c4b802949967ca267eb7f9f2489c81510181d0d311b53101a56e0",
    );
  });

  it("preserves raw V1 quotes while normalizing legacy risk only for public use", () => {
    const quote = {
      version: 1,
      quoteId: `0x${"11".repeat(32)}`,
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      solverId: "s",
      solverAddress: "0x1111111111111111111111111111111111111111",
      bundleHash: `0x${"22".repeat(32)}`,
      expectedNetApyBps: 1,
      riskGrade: "low",
      priceAtomic: "1",
      validUntil: 2_000_000_000,
      verification: { executable: true, errorCodes: [], score: 1 },
    } as const;
    const persisted = PersistedRouteQuoteSchema.parse(quote);
    expect(persisted).toEqual(quote);
    expect(commitment(persisted)).toBe(
      "0x4777415b72df2189a16714beb652565a1898cac55ce51806fc053c438cb24888",
    );
    expect(RouteQuoteSchema.parse(quote).riskGrade).toBe("unassessed");
  });
});
