import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NetworkOverview, type NetworkOverviewReport } from "./NetworkOverview";

const owner = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"ab".repeat(32)}`;
const report: NetworkOverviewReport = {
  version: 1,
  observedAt: 2_000_000_000,
  window: "30d",
  metrics: {
    version: 1,
    totals: { confirmedOutcomes: 1, valuedOutcomes: 1, unvaluedOutcomes: 0,
      verifiedVolumeUsdE8: "99912234" },
    solvers: [{ solverId: "alpha-solver", confirmedOutcomes: 1, valuedOutcomes: 1,
      verifiedVolumeUsdE8: "99912234" }],
  },
  outcomes: [{
    version: 1,
    intentId: "11111111-1111-4111-8111-111111111111",
    submissionId: "22222222-2222-4222-8222-222222222222",
    solverId: "alpha-solver",
    ownerLabel: "0x1111…1111",
    chainId: 196,
    confirmedAtSec: 2_000_000_000,
    transactionHash,
    intentClass: "stablecoin-swap",
    principal: { token: "0x2222222222222222222222222222222222222222",
      symbol: "USDt0", atomic: "1000000", decimals: 6, valuationBlockNumber: "70000000" },
    volumeUsdE8: "99912234",
    resultLabel: "Verified token swap",
  }],
  nextCursor: null,
  exclusions: {},
};
const solvers = [{ id: "alpha-solver", displayName: "Alpha Solver",
  stats: { accepted: 3, rejected: 1, wins: 1, current: 0 } }];

describe("NetworkOverview", () => {
  it("makes every aggregate traceable without exposing a raw owner or goal", () => {
    const html = renderToStaticMarkup(<NetworkOverview report={report} solvers={solvers} />);

    expect(html).toContain("Every outcome,");
    expect(html).toContain("independently verified.");
    expect(html).toContain("$0.99912234");
    expect(html).toContain("0x1111…1111");
    expect(html).toContain("1 / 1 valued outcomes");
    expect(html).toContain("3 / 4 resolved revisions");
    expect(html).toContain('href="/programs/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain('href="/solvers/alpha-solver"');
    expect(html).toContain(`href="https://web3.okx.com/explorer/x-layer/evm/tx/${transactionHash}"`);
    expect(html).not.toContain(owner);
    expect(html).not.toContain("Private raw goal");
  });

  it("shows an honest empty state without sample activity", () => {
    const empty = { ...report, metrics: { ...report.metrics, totals: {
      confirmedOutcomes: 0, valuedOutcomes: 0, unvaluedOutcomes: 0, verifiedVolumeUsdE8: "0",
    }, solvers: [] }, outcomes: [] };
    const html = renderToStaticMarkup(<NetworkOverview report={empty} solvers={[]} />);

    expect(html).toContain("No confirmed outcomes in this window");
    expect(html).toContain('href="/intents/new"');
    expect(html).not.toContain("Alpha Solver");
  });

  it("reports service failure without rendering zero proof", () => {
    const html = renderToStaticMarkup(<NetworkOverview report={null} solvers={[]} />);
    expect(html).toContain("Network evidence unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("No confirmed outcomes");
  });
});
