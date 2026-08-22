import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntentCompetitionView } from "./IntentCompetitionView";

const closesAt = "2033-05-18T03:35:00.000Z";

describe("IntentCompetitionView", () => {
  it("makes a live empty competition read as waiting for submissions", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Supply bounded USDG"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      current={[]}
      history={[]}
    />);

    expect(html).not.toContain("Live · accepting proposals");
    expect(html).toContain("Accepting proposals");
    expect(html).toContain("Waiting for solver submissions");
    expect(html).toContain("New solver jobs can still be submitted before the deadline.");
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
    expect(html).not.toContain("Waiting for solver submissions");
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
    expect(html).toContain("Recognized");
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
    expect(html).toContain("View details");
  });

  it("shows composed authority, ordered actions, receipt outcome, and net-yield rank", () => {
    const html = renderToStaticMarkup(<IntentCompetitionView
      goal="Best registered stablecoin yield"
      closesAt={closesAt}
      observedAtSec={2_000_000_000}
      composition={{ actions: ["Aave V3 supply", "Curve exact input", "Uniswap V3 exact input"],
        maximumLossBps: 100, minimumReceiptValueBps: 9_900, horizonDays: 30 }}
      history={[]}
      current={[{ id: "11111111-1111-4111-8111-111111111111", solverId: "alpha",
        revision: 1, state: "current", validUntil: closesAt,
        objective: { kind: "composition-net-yield-usd-e8", direction: "maximize",
          atomic: "87400234", horizonDays: 30 },
        preview: { outcomes: [{ symbol: "aUSDt0", decimals: 6,
          beforeAtomic: "0", afterAtomic: "999000", minimumAtomic: "998999" }],
          stepCount: 2, actions: ["curve-stableswap-ng.exact-input@1", "aave-v3.supply@1"] } }]}
    />);

    expect(html).toContain("Signed program authority");
    expect(html).toContain("Conversion loss");
    expect(html).toContain("≤ 1%");
    expect(html).toContain("Receipt value");
    expect(html).toContain("≥ 99%");
    expect(html).toContain("curve-stableswap-ng.exact-input → aave-v3.supply");
    expect(html).toContain("+0.999000 aUSDt0");
    expect(html).toContain("$0.874002 net terminal · 30d");
  });
});
