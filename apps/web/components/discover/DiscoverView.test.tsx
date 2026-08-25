import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscoverView } from "./DiscoverView";

describe("DiscoverView", () => {
  it("leads with verified programs and separates open competitions from reusable starts", () => {
    const html = renderToStaticMarkup(<DiscoverView
      challenges={[{ id: "stable-outcome", title: "Stable outcome", goal: "Find the strongest bounded stablecoin outcome.", availability: "between-rounds" }]}
      intents={[{ id: "550e8400-e29b-41d4-a716-446655440000", goal: "Move 10 USDG with a minimum.", state: "collecting", closesAt: "2026-08-18T18:00:00.000Z" }]}
      history={[{ id: "program-1", goal: "Past stablecoin discovery", solver: "Cobia coding agent", state: "expired",
        protocols: ["Curve", "Aave V3"] }]}
      commerceOffers={[]}
      observedAtSec={2_000_000_000}
    />);

    expect(html).toContain("Find a starting point.");
    expect(html).toContain("Verified programs");
    expect(html).toContain("Solver competitions");
    expect(html).toContain("Ready-made starts");
    expect(html).toContain("No solver work runs while it sits here.");
    expect(html).toContain("What solvers can use");
    expect(html).toContain("Aave V3");
    expect(html).toContain("Curve");
    expect(html).toContain("Uniswap V3");
    expect(html).toContain("OKX DEX");
    expect(html).toContain("Committed aggregator routes with exact-call replay");
    expect(html).toContain("brand-mark--okx");
    expect(html).toContain("Pendle");
    expect(html).toContain("Read-only USDG PT market discovery");
    expect(html).toContain("brand-mark--pendle");
    expect(html.indexOf('id="history-title">Verified programs')).toBeLessThan(html.indexOf('id="starts-title">Ready-made starts'));
    expect(html.indexOf('id="history-title">Verified programs')).toBeLessThan(html.indexOf('id="commerce-title">Paid resources'));
    expect(html).toContain("Inspect an OKX Agent Payment");
    expect(html).toContain("Read only");
    expect(html).toContain("Expired");
    expect(html).toContain("brand-mark--curve");
    expect(html).toContain("brand-mark--aave");
    expect(html).not.toContain("Execute");
    expect(html).toContain("Start a round");
    expect(html).toContain('href="/intents/new?challenge=stable-outcome"');
  });

  it("states truthful empty collections", () => {
    const html = renderToStaticMarkup(<DiscoverView challenges={[]} history={[]} intents={[]} commerceOffers={[]} observedAtSec={2_000_000_000} />);
    expect(html).toContain("No ready-made starts yet");
    expect(html).toContain("No open competitions");
    expect(html).toContain('href="/intents/new"');
    expect(html).toContain("Create an intent");
    expect(html).toContain("No verified programs yet");
    expect(html).toContain("Programs appear here after a solver proposal is checked and resolved.");
    expect(html).toContain("No supported paid resources are available yet");
  });

  it("keeps older programs available without making them compete with current evidence", () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      id: `program-${index}`, goal: `Past discovery ${index}`, solver: "Cobia coding agent", state: "executed",
      protocols: [],
    }));
    const html = renderToStaticMarkup(<DiscoverView challenges={[]} history={history} intents={[]}
      commerceOffers={[]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Show 1 older program");
    expect(html).toContain('href="/programs/program-6"');
  });

  it("keeps healthy sections usable when one source is unavailable", () => {
    const html = renderToStaticMarkup(<DiscoverView
      challenges={[{ id: "stable-outcome", title: "Stable outcome", goal: "Find it.", availability: "live" }]}
      history={[]}
      intents={[]}
      commerceOffers={[]}
      observedAtSec={2_000_000_000}
      sectionErrors={{ commerce: "Paid-resource discovery is temporarily unavailable." }}
    />);

    expect(html).toContain("Stable outcome");
    expect(html).toContain("Paid-resource discovery is temporarily unavailable.");
    expect(html).not.toContain("No supported paid resources are available yet");
  });
});
