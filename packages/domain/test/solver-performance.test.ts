import { describe, expect, it } from "vitest";
import { aggregateSolverPerformanceV1 } from "../src/solver-performance";

const window = { fromSec: 1_000, toSec: 2_000 };
const segment = { chainId: 196, intentClass: "swap" };

describe("solver performance aggregation", () => {
  it("reports segmented rates with explicit denominators and verified outcome quality", () => {
    const report = aggregateSolverPerformanceV1({
      solverId: "alpha-solver",
      segment,
      window,
      records: [
        {
          intentId: "11111111-1111-4111-8111-111111111111",
          observedAtSec: 1_100,
          firstSubmissionLatencySec: 12,
          decision: "submitted",
          submissionCount: 2,
          acceptedSubmissionCount: 2,
          rejectedSubmissionCount: 0,
          replayRejectedSubmissionCount: 0,
          won: true,
          execution: "succeeded",
          outcome: {
            direction: "maximize",
            requiredAtomic: "10000000",
            firstAcceptedAtomic: "10050000",
            bestAcceptedAtomic: "10100000",
          },
        },
        {
          intentId: "22222222-2222-4222-8222-222222222222",
          observedAtSec: 1_200,
          firstSubmissionLatencySec: 28,
          decision: "submitted",
          submissionCount: 1,
          acceptedSubmissionCount: 0,
          rejectedSubmissionCount: 1,
          replayRejectedSubmissionCount: 1,
          won: false,
          execution: "unselected",
        },
        {
          intentId: "33333333-3333-4333-8333-333333333333",
          observedAtSec: 1_300,
          decision: "abstained",
          submissionCount: 0,
          acceptedSubmissionCount: 0,
          rejectedSubmissionCount: 0,
          replayRejectedSubmissionCount: 0,
          won: false,
          execution: "unselected",
        },
      ],
    });

    expect(report).toMatchObject({
      version: 1,
      solverId: "alpha-solver",
      segment,
      window,
      counts: {
        observedIntents: 3,
        submittedIntents: 2,
        abstainedIntents: 1,
        submissions: 3,
        acceptedSubmissions: 2,
        rejectedSubmissions: 1,
        replayRejectedSubmissions: 1,
        wonIntents: 1,
        executionAttempts: 1,
        successfulExecutions: 1,
      },
      rates: {
        participation: { numerator: 2, denominator: 3, rateBps: 6_666 },
        verifierAcceptance: { numerator: 2, denominator: 3, rateBps: 6_666 },
        win: { numerator: 1, denominator: 2, rateBps: 5_000 },
        executionSuccess: { numerator: 1, denominator: 1, rateBps: 10_000 },
        replayRejection: { numerator: 1, denominator: 3, rateBps: 3_333 },
      },
      outcomeQuality: {
        medianVerifiedMarginBps: 100,
        verifiedMarginSampleSize: 1,
        medianRevisionImprovementBps: 49,
        revisionImprovementSampleSize: 1,
      },
      responsiveness: {
        medianFirstSubmissionLatencySec: 20,
        sampleSize: 2,
        status: "preliminary",
      },
    });
    expect(report.rates.win.status).toBe("preliminary");
  });

  it("uses null instead of inventing zero rates and rejects mixed or inconsistent evidence", () => {
    const empty = aggregateSolverPerformanceV1({
      solverId: "new-solver", segment, window, records: [],
    });
    expect(empty.rates.win).toEqual({
      numerator: 0, denominator: 0, rateBps: null, status: "unavailable",
    });
    expect(empty.outcomeQuality).toEqual({
      medianVerifiedMarginBps: null,
      verifiedMarginSampleSize: 0,
      verifiedMarginStatus: "unavailable",
      medianRevisionImprovementBps: null,
      revisionImprovementSampleSize: 0,
      revisionImprovementStatus: "unavailable",
    });
    expect(empty.responsiveness).toEqual({
      medianFirstSubmissionLatencySec: null,
      sampleSize: 0,
      status: "unavailable",
    });

    expect(() => aggregateSolverPerformanceV1({
      solverId: "new-solver", segment, window,
      records: [{
        intentId: "11111111-1111-4111-8111-111111111111",
        observedAtSec: 1_100,
        decision: "abstained",
        submissionCount: 1,
        acceptedSubmissionCount: 0,
        rejectedSubmissionCount: 1,
        replayRejectedSubmissionCount: 0,
        won: false,
        execution: "unselected",
      }],
    })).toThrow("Abstention cannot contain submissions");
  });

  it("keeps solver generation failures distinct from deliberate abstentions", () => {
    const report = aggregateSolverPerformanceV1({
      solverId: "unstable-solver", segment, window,
      records: [{
        intentId: "11111111-1111-4111-8111-111111111111",
        observedAtSec: 1_100,
        decision: "failed",
        submissionCount: 0,
        acceptedSubmissionCount: 0,
        rejectedSubmissionCount: 0,
        replayRejectedSubmissionCount: 0,
        won: false,
        execution: "unselected",
      }],
    });

    expect(report.counts).toMatchObject({ failedIntents: 1, abstainedIntents: 0 });
    expect(report.rates.generationSuccess).toEqual({
      numerator: 0, denominator: 1, rateBps: 0, status: "preliminary",
    });
  });
});
