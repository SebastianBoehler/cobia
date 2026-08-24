import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/network/TestnetHome", () => ({ TestnetHome: () => null }));
vi.mock("@/lib/network/site-network-server", () => ({
  getSiteNetwork: async () => ({ mode: "mainnet", chainId: 196 }),
}));

import Home from "./page";

describe("home conversion path", () => {
  it("starts with a plain-language outcome and leads directly to mainnet proof", async () => {
    const html = renderToStaticMarkup(await Home());
    const outcomeIndex = html.indexOf("Describe an outcome");
    const proofIndex = html.indexOf("See mainnet proof");

    expect(outcomeIndex).toBeGreaterThan(-1);
    expect(proofIndex).toBeGreaterThan(outcomeIndex);
    expect(html).toContain('href="/intents/new"');
    expect(html).toContain('href="/buildx#evidence"');
    expect(html).toContain('action="/intents/new"');
    expect(html).toContain('name="goal"');
    expect(html).toContain("@USDG");
    expect(html).toContain("@Aave");
    expect(html).toContain("State the outcome. Keep the keys.");
    expect(html).toContain("AI solvers compete to produce the best transaction plan");
    expect(html).toContain("25+ confirmed outcomes");
    expect(html).not.toContain("home-eyebrow");
    expect(html).not.toContain("home-mode-tabs");
    expect(html).not.toContain("Policy receipt");
  });

  it("keeps solver creativity separate from verification and wallet approval", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Solvers search");
    expect(html).toContain("Cobia verifies");
    expect(html).toContain("You approve");
    expect(html).toContain("Access your private key");
    expect(html).toContain("test them in an isolated rehearsal");
  });

  it("makes the wallet product and competition model visible before architecture", async () => {
    const html = renderToStaticMarkup(await Home());
    const portfolioIndex = html.indexOf("Portfolio");
    const activityIndex = html.indexOf("Activity");
    const standingIndex = html.indexOf("Standing challenges");
    const architectureIndex = html.indexOf("AI can explore");

    expect(portfolioIndex).toBeGreaterThan(-1);
    expect(activityIndex).toBeGreaterThan(portfolioIndex);
    expect(standingIndex).toBeGreaterThan(activityIndex);
    expect(architectureIndex).toBeGreaterThan(standingIndex);
  });

  it("gives the AI Season submission a dedicated product-facing path", async () => {
    const html = renderToStaticMarkup(await Home());
    const heroIndex = html.indexOf('class="general-hero"');
    const seasonIndex = html.indexOf('id="buildx-callout-title"');
    const productIndex = html.indexOf('aria-label="Cobia product"');

    expect(seasonIndex).toBeGreaterThan(heroIndex);
    expect(seasonIndex).toBeLessThan(productIndex);
    expect(html).toContain("Built for AI Season. Working on X Layer mainnet.");
    expect(html).toContain("inspect the transactions, receipts, and source behind every claim");
    expect(html).toContain("Watch demo and proof");
    expect(html).not.toMatch(/judg(?:e|ing)/i);
    expect(html).toContain('href="/buildx"');
  });

  it("shows only live proof surfaces instead of planned capabilities", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("AI finds options. You keep control.");
    expect(html).toContain("Live transactions on X Layer");
    expect(html).toContain("Solvers compete for you");
    expect(html).toContain("Every plan is tested first");
    expect(html).toContain("Results anyone can verify");
    expect(html).not.toContain("Verified xStocks acquisition");
    expect(html).not.toContain("Recurring actions");
    expect(html).toContain('href="/solvers"');
  });
});
