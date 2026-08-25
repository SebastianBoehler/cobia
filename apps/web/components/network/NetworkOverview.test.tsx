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
    route: {
      protocols: ["Curve"],
      minimumOutputs: [{ token: "0x3333333333333333333333333333333333333333",
        symbol: "USDG", atomic: "999000", decimals: 6 }],
    },
    volumeUsdE8: "99912234",
    resultLabel: "Token swap",
  }],
  nextCursor: null,
  exclusions: {},
};
const solvers = [{ id: "alpha-solver", displayName: "Alpha Solver",
  declaredCapabilities: ["curve-stableswap-ng.exact-input@1", "general-asset@1",
    "pendle.xlayer.market-discovery"],
  stats: { accepted: 3, rejected: 1, wins: 1, current: 0 } }];

describe("NetworkOverview", () => {
  it("makes every aggregate traceable without exposing a raw owner or goal", () => {
    const html = renderToStaticMarkup(<NetworkOverview report={report} solvers={solvers} />);

    expect(html).toContain("See exactly what happened ");
    expect(html).toContain("<em>onchain.</em>");
    expect(html).toContain("Inspect confirmed outcomes");
    expect(html).toContain("Compare solvers by verified results");
    expect(html).not.toContain("Performance without an opaque score");
    expect(html).not.toContain("Public proof log");
    expect(html).not.toContain("Solver evidence");
    expect(html).toContain("<table");
    expect(html).toContain('<th scope="col">Outcome</th>');
    expect(html).toContain("View solver");
    expect(html).toContain("$0.99912234");
    expect(html).toContain("0x1111…1111");
    expect(html).toContain("1 / 1 valued outcomes");
    expect(html).toContain("3 / 4 resolved revisions");
    expect(html).toContain("Declared protocol support");
    expect(html).toContain('aria-label="Supported Cobia protocol integrations"');
    expect(html).toContain("Live compiled routes");
    expect(html).toContain("Bounded supply");
    expect(html).toContain("Stable swaps");
    expect(html).toContain("Swap + LP");
    expect(html).toContain("Discovery only");
    expect(html).toContain('title="OKX DEX: declared"');
    expect(html).toContain('title="Pendle: declared"');
    expect(html).toContain('<th scope="col">Route</th>');
    expect(html).toContain('aria-label="USDt0 through Curve to USDG"');
    expect(html).not.toContain("Minimum output");
    expect(html).not.toContain('<th scope="col">Protocols</th>');
    expect(html).not.toContain("1000000");
    expect(html).not.toContain("999000");
    expect(html).toContain('href="/programs/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain('href="/solvers/alpha-solver"');
    expect(html).toContain(`href="https://web3.okx.com/explorer/x-layer/evm/tx/${transactionHash}"`);
    expect(html).toContain("Transaction for Token swap (opens in new tab)");
    expect(html).toContain("Tx hash");
    expect(html).not.toContain("stablecoin swap");
    expect(html).not.toContain("$0.99912234 principal");
    expect(html).not.toContain(owner);
    expect(html).not.toContain("Private raw goal");
  });

  it("renders native OKB routes with the official token mark", () => {
    const okbReport = {
      ...report,
      outcomes: [{
        ...report.outcomes[0]!,
        principal: {
          ...report.outcomes[0]!.principal,
          token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          symbol: "OKB",
          decimals: 18,
        },
      }],
    };
    const html = renderToStaticMarkup(<NetworkOverview report={okbReport} solvers={solvers} />);

    expect(html).toContain(
      'aria-label="OKB token" class="brand-mark brand-mark--asset brand-mark--okb"',
    );
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

  it("keeps older confirmed outcomes behind an in-place disclosure", () => {
    const outcomes = Array.from({ length: 7 }, (_, index) => ({
      ...report.outcomes[0]!,
      submissionId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
      intentId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
    }));
    const expanded = {
      ...report,
      outcomes,
      metrics: {
        ...report.metrics,
        totals: { ...report.metrics.totals, confirmedOutcomes: 7 },
      },
    };
    const html = renderToStaticMarkup(<NetworkOverview report={expanded} solvers={solvers} />);

    expect(html).toContain("Show 1 older confirmed outcome");
    expect(html).toContain("7 of 7 currently loaded");
    expect(html).toContain("<details");
  });

  it("reports service failure without rendering zero proof", () => {
    const html = renderToStaticMarkup(<NetworkOverview report={null} solvers={[]} />);
    expect(html).toContain("Network evidence unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("No confirmed outcomes");
  });
});
