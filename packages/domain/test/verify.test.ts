import { describe, expect, it } from "vitest";
import {
  commitment,
  verifyBundle,
  type MarketSnapshot,
} from "../src/index";
import {
  account,
  criticalRiskFlag,
  hash,
  nowSec,
  policy,
  signedBundle,
  snapshot,
} from "./verification-fixtures";

const multiMarketSnapshot: MarketSnapshot = {
  ...snapshot,
  candidates: [
    ...snapshot.candidates,
    {
      id: "aave-v3:usdt",
      kind: "aave-v3",
      investmentId: "196-aave-usdt",
      poolAddress: "0x5555555555555555555555555555555555555555",
      apyBps: 600,
      tvlUsdE6: "500000000000",
      utilizationBps: 7_000,
      retrievedAt: "2026-08-09T10:00:00.000Z",
    },
  ],
};

describe("deterministic bundle verification", () => {
  it("recomputes a valid bundle instead of trusting solver calculations", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      account.address,
      nowSec,
    );

    expect(verdict).toMatchObject({
      executable: true,
      errorCodes: [],
      recomputedNetApyBps: 256,
      riskPenaltyBps: 0,
      score: 256,
    });
  });

  it("rejects a signed expected APY that differs from recomputation", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ expectedNetApyBps: 255 }),
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toContain("EXPECTED_NET_APY_MISMATCH");
  });

  it("rejects a bundle for a different policy", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ policyHash: hash }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("POLICY_HASH_MISMATCH");
  });

  it("rejects a stale market snapshot", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      account.address,
      nowSec + 301,
    );
    expect(verdict.errorCodes).toContain("SNAPSHOT_STALE");
  });

  it("rejects allocation beyond the policy exposure cap", async () => {
    const allocations = [
      { candidateId: "cash:usdc", bps: 5_000 },
      { candidateId: "aave-v3:usdc", bps: 5_000 },
    ];
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ allocations }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("EXPOSURE_LIMIT_EXCEEDED");
  });

  it("rejects aggregate Aave exposure beyond the policy cap", async () => {
    const verdict = await verifyBundle(
      policy,
      multiMarketSnapshot,
      await signedBundle({
        snapshotHash: commitment(multiMarketSnapshot),
        allocations: [
          { candidateId: "cash:usdc", bps: 4_000 },
          { candidateId: "aave-v3:usdc", bps: 3_000 },
          { candidateId: "aave-v3:usdt", bps: 3_000 },
        ],
        expectedNetApyBps: 372,
        action: {
          kind: "aave-v3-supply",
          candidateId: "aave-v3:usdt",
          investmentId: "196-aave-usdt",
          amountAtomic: "7500000000",
        },
      }),
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toContain("EXPOSURE_LIMIT_EXCEEDED");
  });

  it("rejects one supply action for multiple positive protocol allocations", async () => {
    const verdict = await verifyBundle(
      policy,
      multiMarketSnapshot,
      await signedBundle({
        snapshotHash: commitment(multiMarketSnapshot),
        allocations: [
          { candidateId: "cash:usdc", bps: 6_000 },
          { candidateId: "aave-v3:usdc", bps: 2_000 },
          { candidateId: "aave-v3:usdt", bps: 2_000 },
        ],
        expectedNetApyBps: 248,
        action: {
          kind: "aave-v3-supply",
          candidateId: "aave-v3:usdt",
          investmentId: "196-aave-usdt",
          amountAtomic: "5000000000",
        },
      }),
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toContain("ACTION_NOT_ALLOWED");
  });

  it("rejects an action amount that differs from its verified allocation", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        action: {
          kind: "aave-v3-supply",
          candidateId: "aave-v3:usdc",
          investmentId: "196-aave-usdc",
          amountAtomic: "9999999999",
        },
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("ACTION_AMOUNT_MISMATCH");
  });

  it("rejects a cash hold amount that differs from its allocation", async () => {
    const cashPolicy = { ...policy, minNetApyBps: 0 };
    const verdict = await verifyBundle(
      cashPolicy,
      snapshot,
      await signedBundle({
        policyHash: commitment(cashPolicy),
        allocations: [{ candidateId: "cash:usdc", bps: 10_000 }],
        expectedNetApyBps: 0,
        action: { kind: "hold", amountAtomic: "24999999999" },
      }),
      account.address,
      nowSec,
    );

    expect(verdict.errorCodes).toContain("ACTION_AMOUNT_MISMATCH");
  });

  it("rejects an unknown route candidate", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        allocations: [
          { candidateId: "cash:usdc", bps: 6_000 },
          { candidateId: "bridge:unknown", bps: 4_000 },
        ],
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("UNKNOWN_CANDIDATE");
  });

  it("rejects critical sourced risk", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({
        riskFlags: [criticalRiskFlag],
      }),
      account.address,
      nowSec,
    );
    expect(verdict.errorCodes).toContain("CRITICAL_RISK");
  });

  it("penalizes critical risk with the high-severity weight", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle({ riskFlags: [criticalRiskFlag] }),
      account.address,
      nowSec,
    );

    expect(verdict).toMatchObject({ riskPenaltyBps: 100, score: 156 });
  });

  it("rejects a bundle signed by a different solver", async () => {
    const verdict = await verifyBundle(
      policy,
      snapshot,
      await signedBundle(),
      "0x4444444444444444444444444444444444444444",
      nowSec,
    );
    expect(verdict.errorCodes).toContain("SOLVER_SIGNATURE_INVALID");
  });
});
