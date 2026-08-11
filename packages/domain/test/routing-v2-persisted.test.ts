import { describe, expect, it } from "vitest";
import {
  PersistedBundleSchema,
  PersistedRouteQuoteSchema,
  PersistedSnapshotSchema,
  PersistedStablecoinPolicySchema,
  PersistedVerificationVerdictSchema,
  RouteBundleV2Schema,
  RouteQuoteV2Schema,
  commitment,
} from "../src/index";
import {
  bundleV2,
  hashV2,
  policyV2,
  snapshotV2,
} from "./routing-v2-fixtures";

const checksummedUsdt0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const canonicalUsdt0 = checksummedUsdt0.toLowerCase();
const quoteV2Fixture = {
  version: 2,
  quoteId: hashV2,
  requestId: policyV2.requestId,
  solverId: bundleV2.solverId,
  solverAddress: checksummedUsdt0,
  bundleHash: hashV2,
  estimatedPreGasApyBps: 30,
  riskGrade: "unassessed",
  priceAtomic: "100000",
  validUntil: 2_000_000_000,
  authorization: {
    routeAuthorized: false,
    errorCodes: ["ECONOMICS_NOT_VERIFIED"],
  },
} as const;

describe("persisted V1 and V2 envelopes", () => {
  it("keeps the legacy V1 commitment fixture unchanged", () => {
    const legacy = {
      version: 1,
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      executionChainId: 196,
      asset: "0x2222222222222222222222222222222222222222",
      principalAtomic: "25000000000",
      maxProtocolExposureBps: 4_000,
      minTvlUsdE6: "250000000000",
      minNetApyBps: 300,
      maxSnapshotAgeSec: 300,
      deadline: 2_000_000_000,
      noBridges: true,
    };
    expect(PersistedStablecoinPolicySchema.parse(legacy)).toEqual(legacy);
    expect(commitment(legacy)).toBe(
      "0x44a3047d3e6d3b43982dabb7d41decfa21fb6683ffa9b1dd0366b0877642e7b7",
    );
  });

  it("uses explicit version unions and rejects future shapes", () => {
    expect(PersistedStablecoinPolicySchema.parse(policyV2)).toEqual(policyV2);
    expect(PersistedSnapshotSchema.parse(snapshotV2)).toEqual(snapshotV2);
    expect(PersistedBundleSchema.parse(bundleV2)).toEqual(bundleV2);
    expect(
      PersistedStablecoinPolicySchema.safeParse({ ...policyV2, version: 3 }).success,
    ).toBe(false);
  });

  it("persists legacy executable and V2 authorization verdicts without conflating them", () => {
    const legacy = {
      bundleHash: hashV2,
      executable: true,
      errorCodes: [],
      recomputedNetApyBps: 30,
      riskPenaltyBps: 0,
      score: 30,
    };
    const route = {
      bundleHash: hashV2,
      routeAuthorized: true,
      errorCodes: [],
      recomputedPreGasApyBps: 30,
    };

    expect(PersistedVerificationVerdictSchema.parse(legacy)).toEqual(legacy);
    expect(PersistedVerificationVerdictSchema.parse(route)).toEqual(route);
    expect(PersistedVerificationVerdictSchema.safeParse({
      ...legacy,
      ...route,
    }).success).toBe(false);
  });

  it("publishes only the narrow route-authorization assessment", () => {
    expect(RouteBundleV2Schema.safeParse(bundleV2).success).toBe(true);

    const result = RouteQuoteV2Schema.safeParse(quoteV2Fixture);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const canonicalQuote = { ...quoteV2Fixture, solverAddress: canonicalUsdt0 };
    expect(result.data).toEqual(canonicalQuote);
    expect(PersistedRouteQuoteSchema.parse(quoteV2Fixture)).toEqual(canonicalQuote);
    expect(
      RouteQuoteV2Schema.safeParse({
        ...quoteV2Fixture,
        authorization: { ...quoteV2Fixture.authorization, executable: true },
      }).success,
    ).toBe(false);
    expect(
      RouteQuoteV2Schema.safeParse({
        ...quoteV2Fixture,
        authorization: undefined,
        verification: { policyValid: false, errorCodes: [] },
      }).success,
    ).toBe(false);
  });

  it("rejects route authorization with error codes", () => {
    expect(RouteQuoteV2Schema.safeParse({
      ...quoteV2Fixture,
      authorization: {
        routeAuthorized: true,
        errorCodes: ["ECONOMICS_NOT_VERIFIED"],
      },
    }).success).toBe(false);
  });

  it("rejects route denial without an error code", () => {
    expect(RouteQuoteV2Schema.safeParse({
      ...quoteV2Fixture,
      authorization: { routeAuthorized: false, errorCodes: [] },
    }).success).toBe(false);
  });
});
