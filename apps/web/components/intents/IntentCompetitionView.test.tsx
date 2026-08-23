import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntentCompetitionView } from "./IntentCompetitionView";

const closesAt = "2033-05-18T03:35:00.000Z";

describe("IntentCompetitionView", () => {
  it("marks long signed goals for a compact competition heading", () => {
    const longGoal = "Use 1 USDG to enter the best verified stablecoin-yield route ending in USDt0 on X Layer. Only use Aave V3, Curve or Uniswap. Allow no more than 1% conversion loss, require a minimum receipt-token balance, and expire in ten minutes.";
    const longHtml = renderToStaticMarkup(<IntentCompetitionView
      goal={longGoal}
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);
    const shortHtml = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap 1 USDG into USDt0"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(longHtml).toContain('data-title-density="long"');
    expect(longHtml).toContain(longGoal);
    expect(shortHtml).toContain('data-title-density="short"');
  });

  it("shows an active exchange without pretending that a solver has started", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(html).toContain('data-competition-state="open"');
    expect(html).toContain("Solver competition is active");
    expect(html).toContain("Listening for signed proposals");
    expect(html).toContain("Checks for updates every 10 seconds");
    expect(html).not.toContain("Waiting for solver submissions");
  });

  it("shows evidence-backed solver work as a polite busy state", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      solverRuns={[
        { solverId: "cobia-route-scout", displayName: "Cobia Route Scout",
          revision: 1, state: "running", updatedAt: "2033-05-18T03:33:20.000Z" },
        { solverId: "cobia-route-challenger", displayName: "Cobia Route Challenger",
          revision: 1, state: "queued", updatedAt: "2033-05-18T03:33:21.000Z" },
      ]}
    />);

    expect(html).toContain("Solvers are working");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Cobia Route Scout");
    expect(html).toContain("Building a program");
    expect(html).toContain("Cobia Route Challenger");
    expect(html).toContain("Waiting to start");
  });

  it("shows the persisted reason when a solver abstains", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap bounded USDG into OKB"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      solverRuns={[{
        solverId: "cobia-reference", displayName: "Cobia Reference Solver",
        revision: 1, state: "abstained", failureCode: "NO_VERIFIED_OKX_ROUTE",
        updatedAt: "2033-05-18T03:33:20.000Z",
      }]}
    />);

    expect(html).toContain("No route submitted");
    expect(html).toContain("No verified OKX route");
  });

  it("shows the exact signed guardrail when a solver program is rejected", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap bounded USDG into OKB using two wallet steps"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      solverRuns={[{
        solverId: "cobia-reference", displayName: "Cobia Reference Solver",
        revision: 1, state: "failed", failureCode: "MINIMUM_STAGES_NOT_MET",
        updatedAt: "2033-05-18T03:33:20.000Z",
      }]}
    />);

    expect(html).toContain("Proposal rejected");
    expect(html).toContain("Minimum stages not met");
  });

  it("distinguishes verifier work from proposals ready for wallet review", () => {
    const pending = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG" closesAt={closesAt} observedAtSec={2_000_000_000}
      current={[]}
      history={[{ id: "11111111-1111-4111-8111-111111111111", solverId: "alpha", revision: 1,
        state: "pending", validUntil: closesAt, objective: null, preview: null }]}
    />);
    const ready = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG" closesAt={closesAt} observedAtSec={2_000_000_000}
      history={[]}
      current={[{ id: "11111111-1111-4111-8111-111111111111", solverId: "alpha", revision: 1,
        state: "current", validUntil: closesAt, objective: null, preview: null }]}
    />);

    expect(pending).toContain('data-competition-state="verifying"');
    expect(pending).toContain("Verifier is checking proposals");
    expect(pending).toContain("View evidence");
    expect(ready).toContain('data-competition-state="ready"');
    expect(ready).toContain("Verified proposals are ready");
    expect(ready).toContain("Review and execute");
  });

  it("does not describe an elapsed competition as pending", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt="2026-08-20T16:39:37.000Z"
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(html).toContain("Competition closed");
    expect(html).toContain("Closed without a verified program");
    expect(html).not.toContain("Solver activity");
  });

  it("keeps a persisted solver failure visible after the competition closes", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap bounded USDG into OKB using two wallet steps"
      closesAt="2026-08-20T16:39:37.000Z"
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      solverRuns={[{
        solverId: "cobia-reference", displayName: "Cobia Reference Solver",
        revision: 1, state: "failed", failureCode: "MINIMUM_STAGES_NOT_MET",
        updatedAt: "2026-08-20T16:38:20.000Z",
      }]}
    />);

    expect(html).toContain("Solver competition ended");
    expect(html).toContain("No verified proposal");
    expect(html).toContain("Minimum stages not met");
  });

  it("renders compact, icon-led token evidence with the exact frozen details available", () => {
    const token = "0x2222222222222222222222222222222222222222" as const;
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap the input token"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      tokenEvidence={[{ provider: "okx-market-v6", chainId: 196, token,
        name: "Tether USD", symbol: "USDT", decimals: 6, priceUsd: "1.01",
        liquidityUsd: "2500000", holderCount: "4200", top10HolderPercent: "19.75",
        marketDataAt: "2033-05-18T03:33:29.000Z", communityRecognized: true }]}
    />);

    expect(html).toContain("Frozen token evidence");
    expect(html).toContain("<details");
    expect(html).toContain('aria-label="Recognized token"');
    expect(html).not.toContain(">Recognized<");
    expect(html).toContain("web3icons");
    expect(html).toContain(token);
    expect(html).toContain("$1.01");
    expect(html).toContain("$2,500,000");
    expect(html).toContain("4,200");
    expect(html).toContain("19.75%");
    expect(html).toContain("OKX Market API v6");
  });

  it("uses Cobia's existing USDG mark in frozen evidence", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      tokenEvidence={[{ provider: "okx-market-v6", chainId: 196,
        token: "0x3333333333333333333333333333333333333333", name: "Global Dollar", symbol: "USDG",
        decimals: 6, priceUsd: "1", liquidityUsd: "1", holderCount: "1", top10HolderPercent: "1",
        marketDataAt: "2033-05-18T03:33:29.000Z", communityRecognized: true }]}
    />);

    expect(html).toContain("brand-mark--usdg");
  });

  it("renders native OKB evidence without contract-holder fields", () => {
    const native = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Turn USDG into OKB"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
      tokenEvidence={[{ provider: "okx-market-v6", assetType: "native", chainId: 196,
        token: native, name: "OKB", symbol: "OKB", decimals: 18, priceUsd: "110.25",
        liquidityUsd: "15000000", marketDataAt: "2033-05-18T03:33:29.000Z" }]}
    />);

    expect(html).toContain("Native asset");
    expect(html).toContain("$110.25");
    expect(html).not.toContain("Holders");
  });

  it("compares the simulated outcome and wallet steps beside each current program", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Swap the input token"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      history={[]}
      current={[{
        id: "11111111-1111-4111-8111-111111111111", solverId: "alpha", revision: 1,
        state: "current", validUntil: closesAt, objective: null,
        preview: {
          outcomes: [{ symbol: "USDt0", decimals: 6, beforeAtomic: "525665", afterAtomic: "1526002", minimumAtomic: "950000" }],
          stepCount: 2,
        },
      }]}
    />);

    expect(html).toContain("Simulated outcome");
    expect(html).toContain("+1.000337 USDt0");
    expect(html).toContain("Minimum: +0.950000 USDt0");
    expect(html).toContain("Up to 2 wallet steps");
    expect(html).not.toContain("Verified objective");
    expect(html).toContain("Review and execute");
  });

  it("shows composed authority, ordered actions, receipt outcome, and net-yield rank", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Best registered stablecoin yield"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      composition={{ actions: ["Aave V3 supply", "Curve exact input", "Uniswap V3 exact input"],
        maximumLossBps: 100, minimumReceiptValueBps: 9_900, horizonDays: 30,
        terminalAsset: "USDt0" }}
      history={[]}
      current={[{ id: "11111111-1111-4111-8111-111111111111", solverId: "alpha",
        revision: 1, state: "current", validUntil: closesAt,
        objective: { kind: "composition-net-yield-usd-e8", direction: "maximize",
          atomic: "87400234", horizonDays: 30 },
        preview: { outcomes: [{ symbol: "aUSDt0", decimals: 6,
          beforeAtomic: "0", afterAtomic: "999000", minimumAtomic: "998999" }],
          stepCount: 2, actions: ["curve-stableswap-ng.exact-input@1", "aave-v3.supply@1"] } }]}
    />);

    expect(html).toContain("Signed guardrails");
    expect(html).toContain("3 protocols · Max 1% loss · Ends in USDt0");
    expect(html).toContain("Your limit");
    expect(html).toContain("Lose no more than 1% while converting");
    expect(html).toContain("Minimum outcome");
    expect(html).toContain("Receive value worth at least 99% of the input");
    expect(html).toContain("Required result");
    expect(html).toContain("USDt0");
    expect(html).toContain('aria-label="Aave V3"');
    expect(html).toContain('aria-label="Curve"');
    expect(html).toContain('aria-label="Uniswap V3"');
    expect(html).toContain("curve-stableswap-ng.exact-input → aave-v3.supply");
    expect(html).toContain("+0.999000 aUSDt0");
    expect(html).toContain("$0.874002 net terminal · 30d");
  });
});
