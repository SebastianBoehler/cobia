import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/network/TestnetHome", () => ({ TestnetHome: () => null }));
vi.mock("@/lib/network/site-network-server", () => ({
  getSiteNetwork: async () => ({ mode: "mainnet", chainId: 196 }),
}));

import Home from "./page";

describe("home conversion path", () => {
  it("starts with a general goal and one canonical intent action", async () => {
    const html = renderToStaticMarkup(await Home());
    const createIndex = html.indexOf("Create an intent");
    const exploreIndex = html.indexOf("Explore challenges");

    expect(createIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(createIndex);
    expect(html).toContain('href="/intents/new"');
    expect(html).toContain('action="/intents/new"');
    expect(html).toContain('name="goal"');
    expect(html).toContain("@USDG");
    expect(html).toContain("@Aave");
    expect(html).toContain("What should happen onchain?");
    expect(html).toContain("Solvers may submit, revise, or abstain");
    expect(html).not.toContain("home-eyebrow");
    expect(html).not.toMatch(/Earn|Swap|Profit/);
    expect(html).not.toContain("Policy receipt");
  });

  it("keeps solver creativity separate from verification and wallet approval", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Solvers search");
    expect(html).toContain("Cobia verifies");
    expect(html).toContain("You approve");
    expect(html).toContain("never receives your private key");
    expect(html).toContain("Broadcast only to a disposable fork");
  });

  it("makes the wallet product and competition model visible before architecture", async () => {
    const html = renderToStaticMarkup(await Home());
    const portfolioIndex = html.indexOf("Portfolio");
    const activityIndex = html.indexOf("Activity");
    const standingIndex = html.indexOf("Standing challenges");
    const architectureIndex = html.indexOf("Creative search");

    expect(portfolioIndex).toBeGreaterThan(-1);
    expect(activityIndex).toBeGreaterThan(portfolioIndex);
    expect(standingIndex).toBeGreaterThan(activityIndex);
    expect(architectureIndex).toBeGreaterThan(standingIndex);
  });

  it("gives the AI Season submission a dedicated path to judge evidence", async () => {
    const html = renderToStaticMarkup(await Home());
    const heroIndex = html.indexOf('class="general-hero"');
    const seasonIndex = html.indexOf('id="buildx-callout-title"');
    const productIndex = html.indexOf('aria-label="Cobia product"');

    expect(seasonIndex).toBeGreaterThan(heroIndex);
    expect(seasonIndex).toBeLessThan(productIndex);
    expect(html).toContain("Proudly built for X Layer’s AI Season.");
    expect(html).toContain("Cobia’s Build X submission");
    expect(html).toContain("View judge evidence");
    expect(html).toContain('href="/buildx"');
  });

  it("shows semantic and open verified lanes without overstating future domains", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("X Layer protocol intents");
    expect(html).toContain("Curve and Uniswap exact-input swaps");
    expect(html).toContain("Supported");
    expect(html).toContain("Shopping and x402");
    expect(html).toContain("Supported · offer required");
    expect(html).toContain("Open protocol programs");
    expect(html).toContain("Verified program lane");
    expect(html).toContain("Registered RWA acquisition");
    expect(html).toContain("Supported · eligibility required");
    expect(html).toContain("Recurring actions");
    expect(html).toContain("Additional semantics needed");
    expect(html).toContain('href="/solvers"');
  });
});
