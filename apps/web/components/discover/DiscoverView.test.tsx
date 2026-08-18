import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscoverView } from "./DiscoverView";

describe("DiscoverView", () => {
  it("separates persistent challenges, custom competitions, and non-actionable history", () => {
    const html = renderToStaticMarkup(<DiscoverView
      challenges={[{ id: "stable-outcome", title: "Stable outcome", goal: "Find the strongest bounded stablecoin outcome.", availability: "between-rounds" }]}
      intents={[{ id: "550e8400-e29b-41d4-a716-446655440000", goal: "Move 10 USDG with a minimum.", state: "collecting", closesAt: "2026-08-18T18:00:00.000Z" }]}
      history={[{ id: "program-1", goal: "Past stablecoin discovery", solver: "Cobia coding agent", state: "expired" }]}
    />);

    expect(html).toContain("Standing challenges");
    expect(html).toContain("Between rounds");
    expect(html).toContain("Custom intents");
    expect(html).toContain("Past discoveries");
    expect(html).toContain("Expired");
    expect(html).not.toContain("Execute");
    expect(html).toContain('href="/intents/new?challenge=stable-outcome"');
  });

  it("states truthful empty collections", () => {
    const html = renderToStaticMarkup(<DiscoverView challenges={[]} history={[]} intents={[]} />);
    expect(html).toContain("No standing challenges are published yet.");
    expect(html).toContain("No custom intents are collecting proposals.");
    expect(html).toContain("No past discoveries yet.");
  });
});
