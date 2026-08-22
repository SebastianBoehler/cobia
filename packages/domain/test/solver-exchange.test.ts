import { describe, expect, it } from "vitest";
import {
  SolverDecisionClaimV1Schema,
  SolverProfileClaimV1Schema,
  SolverRunClaimV1Schema,
  parseSolverDecisionClaimV1,
  parseSolverProfileClaimV1,
  parseSolverRunClaimV1,
  solverDecisionClaimCommitmentV1,
  solverProfileClaimCommitmentV1,
  solverRunClaimCommitmentV1,
} from "../src";

const claim = {
  version: 1 as const,
  solverId: "alpha-solver",
  displayName: "Alpha Solver",
  operator: "0x1111111111111111111111111111111111111111" as const,
  declaredCapabilities: ["evm.raw@1", "okx.dex@1"],
  nonce: `0x${"11".repeat(32)}` as const,
  issuedAt: 2_000_000_000,
  expiresAt: 2_000_000_300,
};

describe("solver exchange identity", () => {
  it("commits one canonical, short-lived operator-owned profile", () => {
    expect(parseSolverProfileClaimV1(claim, 2_000_000_100)).toEqual(claim);
    expect(solverProfileClaimCommitmentV1(claim)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects profile squatting primitives and ambiguous capability claims", () => {
    const cases = [
      { ...claim, solverId: "Alpha Solver" },
      { ...claim, operator: claim.operator.toUpperCase() },
      { ...claim, declaredCapabilities: ["okx.dex@1", "evm.raw@1"] },
      { ...claim, declaredCapabilities: ["evm.raw@1", "evm.raw@1"] },
      { ...claim, nonce: `0x${"00".repeat(32)}` },
      { ...claim, expiresAt: claim.issuedAt + 901 },
      { ...claim, privateKey: "never" },
    ];
    for (const value of cases) expect(SolverProfileClaimV1Schema.safeParse(value).success).toBe(false);
    expect(() => parseSolverProfileClaimV1(claim, claim.expiresAt)).toThrow("expired");
  });
});

const run = {
  version: 1 as const,
  solverId: claim.solverId,
  intentId: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  snapshotHash: `0x${"33".repeat(32)}` as const,
  nonce: `0x${"55".repeat(32)}` as const,
  issuedAt: 2_000_000_000,
  expiresAt: 2_000_000_300,
};

describe("solver run authority", () => {
  it("binds a started revision to one trusted snapshot", () => {
    expect(parseSolverRunClaimV1(run, 2_000_000_100)).toEqual(run);
    expect(solverRunClaimCommitmentV1(run)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects stale or unbound run authority", () => {
    const cases = [
      { ...run, revision: 0 },
      { ...run, snapshotHash: `0x${"00".repeat(32)}` },
      { ...run, nonce: `0x${"00".repeat(32)}` },
      { ...run, expiresAt: run.issuedAt + 301 },
      { ...run, state: "running" },
    ];
    for (const value of cases) expect(SolverRunClaimV1Schema.safeParse(value).success).toBe(false);
    expect(() => parseSolverRunClaimV1(run, run.expiresAt)).toThrow("expired");
  });
});

const decision = {
  version: 1 as const,
  solverId: claim.solverId,
  intentId: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  decisionHash: `0x${"22".repeat(32)}` as const,
  snapshotHash: `0x${"33".repeat(32)}` as const,
  nonce: `0x${"44".repeat(32)}` as const,
  issuedAt: 2_000_000_000,
  expiresAt: 2_000_000_300,
};

describe("solver decision authority", () => {
  it("binds one immutable revision to its decision and trusted snapshot", () => {
    expect(parseSolverDecisionClaimV1(decision, 2_000_000_100)).toEqual(decision);
    expect(solverDecisionClaimCommitmentV1(decision)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects replayable, stale, or unbound decision authority", () => {
    const cases = [
      { ...decision, revision: 0 },
      { ...decision, decisionHash: `0x${"00".repeat(32)}` },
      { ...decision, snapshotHash: `0x${"00".repeat(32)}` },
      { ...decision, nonce: `0x${"00".repeat(32)}` },
      { ...decision, expiresAt: decision.issuedAt + 301 },
      { ...decision, signature: "embedded" },
    ];
    for (const value of cases) expect(SolverDecisionClaimV1Schema.safeParse(value).success).toBe(false);
    expect(() => parseSolverDecisionClaimV1(decision, decision.expiresAt)).toThrow("expired");
  });
});
