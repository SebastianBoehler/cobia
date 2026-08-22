import { describe, expect, it } from "vitest";
import {
  aggregateNetworkMetricsV1,
  projectPublicOutcomeV1,
  type NetworkOutcomeCandidateV1,
} from "../src/network-metrics";

const owner = "0x1111111111111111111111111111111111111111";
const candidate: NetworkOutcomeCandidateV1 = {
  intentId: "11111111-1111-4111-8111-111111111111",
  submissionId: "22222222-2222-4222-8222-222222222222",
  solverId: "alpha-solver",
  owner,
  chainId: 196,
  state: "executed",
  selected: true,
  confirmedAtSec: 2_000_000_000,
  transactionHash: `0x${"ab".repeat(32)}`,
  intentClass: "stablecoin-swap",
  principal: {
    token: "0x2222222222222222222222222222222222222222",
    symbol: "USDt0",
    atomic: "1000000",
  },
  route: {
    protocols: ["Curve", "Aave V3"],
    minimumOutputs: [{
      token: "0x3333333333333333333333333333333333333333",
      symbol: "aUSDG",
      atomic: "999000",
      decimals: 6,
    }],
  },
  valuation: { decimals: 6, priceUsdE8: "100000000", blockNumber: "76543210" },
  resultLabel: "Received 0.999471 USDG",
};

function outcome(value: Partial<NetworkOutcomeCandidateV1> = {}) {
  const projected = projectPublicOutcomeV1({ ...candidate, ...value });
  if (!("outcome" in projected)) throw new Error(`Expected outcome, got ${projected.excluded}`);
  return projected.outcome;
}

describe("public network outcomes", () => {
  it("counts one confirmed principal without leaking the owner address", () => {
    const projected = projectPublicOutcomeV1(candidate);

    expect(projected).toEqual({
      outcome: expect.objectContaining({
        version: 1,
        intentId: candidate.intentId,
        submissionId: candidate.submissionId,
        solverId: "alpha-solver",
        ownerLabel: "0x1111…1111",
        volumeUsdE8: "100000000",
        transactionHash: candidate.transactionHash,
        route: candidate.route,
      }),
    });
    expect(JSON.stringify(projected)).not.toContain(owner);
    expect(JSON.stringify(projected)).not.toContain("displayGoal");
  });

  it.each([
    [{ selected: false }, "NOT_SELECTED"],
    [{ state: "attested" }, "NOT_EXECUTED"],
    [{ chainId: 1 }, "UNSUPPORTED_CHAIN"],
    [{ transactionHash: null }, "RECEIPT_MISSING"],
  ] as const)("excludes evidence that is not a confirmed winning X Layer outcome", (value, reason) => {
    expect(projectPublicOutcomeV1({ ...candidate, ...value })).toEqual({ excluded: reason });
  });

  it("keeps a confirmed outcome visible but unvalued without committed price evidence", () => {
    expect(outcome({ valuation: null })).toMatchObject({
      volumeUsdE8: null,
      principal: { atomic: "1000000", symbol: "USDt0" },
    });
  });

  it("aggregates valued principal once per unique winning submission", () => {
    const second = outcome({
      intentId: "33333333-3333-4333-8333-333333333333",
      submissionId: "44444444-4444-4444-8444-444444444444",
      solverId: "beta-solver",
      valuation: null,
    });
    const report = aggregateNetworkMetricsV1({ outcomes: [outcome(), second] });

    expect(report.totals).toEqual({
      confirmedOutcomes: 2,
      valuedOutcomes: 1,
      unvaluedOutcomes: 1,
      verifiedVolumeUsdE8: "100000000",
    });
    expect(report.solvers).toEqual([
      { solverId: "alpha-solver", confirmedOutcomes: 1, valuedOutcomes: 1,
        verifiedVolumeUsdE8: "100000000" },
      { solverId: "beta-solver", confirmedOutcomes: 1, valuedOutcomes: 0,
        verifiedVolumeUsdE8: "0" },
    ]);
    expect(() => aggregateNetworkMetricsV1({ outcomes: [outcome(), outcome()] }))
      .toThrow("Duplicate network outcome");
  });
});
