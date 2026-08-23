import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SolverProfileView } from "./SolverProfileView";

describe("SolverProfileView", () => {
  it("shows segmented evidence with sample sizes instead of an opaque score", () => {
    const html = renderToStaticMarkup(<SolverProfileView profile={{
      displayName: "Alpha Solver",
      operatorKind: "community",
      attestationAddress: "0x1111111111111111111111111111111111111111",
      declaredCapabilities: ["aave-v3.positions@1", "curve-stableswap-ng.liquidity@1",
        "uniswap-v3.swaps@1", "okx.dex-routing@1", "xlayer.native-okb@1",
        "general.evm-program@1"],
      stats: { accepted: 2, rejected: 1, wins: 1, current: 0 },
      submissions: [],
      performance: [{
        version: 1,
        solverId: "alpha-solver",
        segment: { chainId: 196, intentClass: "swap" },
        window: { fromSec: 1_000, toSec: 2_000 },
        establishedSampleSize: 10,
        counts: {
          observedIntents: 3, submittedIntents: 2, abstainedIntents: 1,
          failedIntents: 0, submissions: 3, acceptedSubmissions: 2,
          rejectedSubmissions: 1, replayRejectedSubmissions: 1,
          wonIntents: 1, executionAttempts: 0, successfulExecutions: 0,
        },
        rates: {
          participation: { numerator: 2, denominator: 3, rateBps: 6_666, status: "preliminary" },
          generationSuccess: { numerator: 2, denominator: 2, rateBps: 10_000, status: "preliminary" },
          verifierAcceptance: { numerator: 2, denominator: 3, rateBps: 6_666, status: "preliminary" },
          win: { numerator: 1, denominator: 2, rateBps: 5_000, status: "preliminary" },
          executionSuccess: { numerator: 0, denominator: 0, rateBps: null, status: "unavailable" },
          replayRejection: { numerator: 1, denominator: 3, rateBps: 3_333, status: "preliminary" },
        },
        outcomeQuality: {
          medianVerifiedMarginBps: 250, verifiedMarginSampleSize: 2,
          verifiedMarginStatus: "preliminary",
          medianRevisionImprovementBps: 75, revisionImprovementSampleSize: 1,
          revisionImprovementStatus: "preliminary",
        },
        responsiveness: {
          medianFirstSubmissionLatencySec: 18,
          sampleSize: 2,
          status: "preliminary",
        },
      }],
    }} />);

    expect(html).toContain("30-day verifier evidence");
    expect(html).toContain('aria-label="Verifier-owned record totals"');
    expect(html).toContain('aria-label="Aave V3"');
    expect(html).toContain('aria-label="Curve"');
    expect(html).toContain('aria-label="Uniswap V3"');
    expect(html).toContain('aria-label="OKX"');
    expect(html).toContain('aria-label="X Layer"');
    expect(html).toContain("Operator-declared capabilities");
    expect(html).toContain("general.evm-program@1");
    expect(html).toContain("X Layer · swap");
    expect(html).toContain("Win rate");
    expect(html).toContain("50.00%");
    expect(html).toContain("1 / 2 entered intents");
    expect(html).toContain("Preliminary until n=10");
    expect(html).toContain("Execution success");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Verified outcome margin");
    expect(html).toContain("2.50%");
    expect(html).toContain("2 comparable outcomes");
    expect(html).toContain("Revision improvement");
    expect(html).toContain("0.75%");
    expect(html).toContain("1 comparable revision");
    expect(html).toContain("Median first submission");
    expect(html).toContain("18s");
    expect(html).toContain("2 timed intents");
    expect(html).not.toContain("Quality score");
  });
});
