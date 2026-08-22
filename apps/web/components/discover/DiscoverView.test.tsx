import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscoverView } from "./DiscoverView";

describe("DiscoverView", () => {
  it("separates persistent challenges, custom competitions, and non-actionable history", () => {
    const html = renderToStaticMarkup(<DiscoverView
      challenges={[{ id: "stable-outcome", title: "Stable outcome", goal: "Find the strongest bounded stablecoin outcome.", availability: "between-rounds" }]}
      intents={[{ id: "550e8400-e29b-41d4-a716-446655440000", goal: "Move 10 USDG with a minimum.", state: "collecting", closesAt: "2026-08-18T18:00:00.000Z" }]}
      history={[{ id: "program-1", goal: "Past stablecoin discovery", solver: "Cobia coding agent", state: "expired",
        protocols: ["Curve", "Aave V3"] }]}
      commerceOffers={[]}
      observedAtSec={2_000_000_000}
    />);

    expect(html).toContain("Standing challenges");
    expect(html).toContain("X Layer protocol coverage");
    expect(html).toContain("Aave V3");
    expect(html).toContain("Curve");
    expect(html).toContain("Uniswap V3");
    expect(html).toContain("Pendle");
    expect(html).toContain("Read-only USDG PT market discovery");
    expect(html).toContain("brand-mark--pendle");
    expect(html).toContain("exact-call replay lane");
    expect(html.indexOf("Standing challenges")).toBeLessThan(html.indexOf("Paid resources"));
    expect(html).not.toContain("Between rounds");
    expect(html).toContain("Custom intents");
    expect(html).toContain("Past discoveries");
    expect(html.indexOf("</aside>")).toBeLessThan(html.indexOf("Past discoveries"));
    expect(html.indexOf("Past discoveries")).toBeLessThan(html.indexOf("Paid resources"));
    expect(html).toContain("Expired");
    expect(html).toContain("brand-mark--curve");
    expect(html).toContain("brand-mark--aave");
    expect(html).not.toContain("Execute");
    expect(html).toContain('href="/intents/new?challenge=stable-outcome"');
  });

  it("states truthful empty collections", () => {
    const html = renderToStaticMarkup(<DiscoverView challenges={[]} history={[]} intents={[]} commerceOffers={[]} observedAtSec={2_000_000_000} />);
    expect(html).toContain("No standing challenges are published yet.");
    expect(html).toContain("No custom intents are collecting proposals.");
    expect(html).toContain('href="/intents/new"');
    expect(html).toContain("Create an intent");
    expect(html).toContain("Verified solver history will appear here after a program resolves.");
    expect(html).toContain("No supported paid resources are available yet");
  });

  it("keeps older discoveries available without making them compete with current actions", () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      id: `program-${index}`, goal: `Past discovery ${index}`, solver: "Cobia coding agent", state: "executed",
      protocols: [],
    }));
    const html = renderToStaticMarkup(<DiscoverView challenges={[]} history={history} intents={[]}
      commerceOffers={[]} observedAtSec={2_000_000_000} />);

    expect(html).toContain("Show 2 older discoveries");
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
