import { describe, expect, it } from "vitest";
import { projectSolverPerformance } from "./solver-performance-projection";

const policy = {
  version: 3,
  kind: "open-onchain",
  outcomes: [{
    kind: "minimum-increase",
    chainId: 196,
    token: "0x1111111111111111111111111111111111111111",
    atomic: "10000000",
  }],
};

describe("solver performance projection", () => {
  it("derives verified quality from comparable accepted objective artifacts", () => {
    const observedAtSec = 2_000_000_000;
    const intentId = "11111111-1111-4111-8111-111111111111";
    const report = projectSolverPerformance({
      solverId: "alpha-solver",
      observedAtSec,
      runs: [{ intentId, state: "completed", createdAt: new Date((observedAtSec - 12) * 1_000) }],
      intents: [{ id: intentId, chainId: 196, selectedSubmissionId: "second", policy }],
      submissions: [
        { id: "first", intentId, revision: 1, state: "superseded", failureCodes: [],
          createdAt: new Date(observedAtSec * 1_000),
          objective: { direction: "maximize", atomic: "10100000" } },
        { id: "second", intentId, revision: 2, state: "attested", failureCodes: [],
          createdAt: new Date((observedAtSec + 5) * 1_000),
          objective: { direction: "maximize", atomic: "10300000" } },
      ],
    })[0];

    expect(report?.outcomeQuality).toEqual({
      medianVerifiedMarginBps: 300,
      verifiedMarginSampleSize: 1,
      verifiedMarginStatus: "preliminary",
      medianRevisionImprovementBps: 198,
      revisionImprovementSampleSize: 1,
      revisionImprovementStatus: "preliminary",
    });
    expect(report?.segment.intentClass).toBe("balance-outcome");
    expect(report?.responsiveness).toEqual({
      medianFirstSubmissionLatencySec: 12,
      sampleSize: 1,
      status: "preliminary",
    });
  });

  it("segments x402 and cross-chain evidence instead of mixing unrelated work", () => {
    const observedAtSec = 2_000_000_000;
    const runs = [
      { intentId: "11111111-1111-4111-8111-111111111111", state: "abstained" as const,
        createdAt: new Date(observedAtSec * 1_000) },
      { intentId: "22222222-2222-4222-8222-222222222222", state: "abstained" as const,
        createdAt: new Date(observedAtSec * 1_000) },
    ];
    const reports = projectSolverPerformance({
      solverId: "alpha-solver", observedAtSec, runs, submissions: [],
      intents: [
        { id: runs[0]!.intentId, chainId: 196, selectedSubmissionId: null,
          policy: { version: 3, executionChainIds: [196], outcomes: [{ kind: "x402-receipt" }] } },
        { id: runs[1]!.intentId, chainId: 196, selectedSubmissionId: null,
          policy: { version: 3, executionChainIds: [1, 196], outcomes: [{ kind: "minimum-final" }] } },
      ],
    });

    expect(reports.map(({ segment }) => segment.intentClass)).toEqual(["cross-chain", "x402"]);
  });

  it("keeps historical submissions without a trustworthy latency sample", () => {
    const observedAtSec = 2_000_000_000;
    const intentId = "11111111-1111-4111-8111-111111111111";
    const report = projectSolverPerformance({
      solverId: "alpha-solver",
      observedAtSec,
      runs: [{ intentId, state: "completed", createdAt: new Date(observedAtSec * 1_000) }],
      intents: [{ id: intentId, chainId: 196, selectedSubmissionId: null, policy }],
      submissions: [{
        id: "historical", intentId, revision: 1, state: "verified", failureCodes: [],
        createdAt: new Date((observedAtSec - 60) * 1_000),
        objective: { direction: "maximize", atomic: "10100000" },
      }],
    })[0];

    expect(report?.counts).toMatchObject({ observedIntents: 1, submittedIntents: 1, submissions: 1 });
    expect(report?.responsiveness).toEqual({
      medianFirstSubmissionLatencySec: null,
      sampleSize: 0,
      status: "unavailable",
    });
  });
});
