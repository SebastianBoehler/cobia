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
    expect(html).toContain("What should happen onchain?");
    expect(html).toContain("Solvers may submit, revise, or abstain");
    expect(html).not.toContain("home-eyebrow");
    expect(html).not.toMatch(/Earn|Swap|Profit/);
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

  it("labels live and future domains without pretending future capabilities exist", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Investments");
    expect(html).toContain("Exact-input swaps and Aave supply");
    expect(html).toContain("Live capability");
    expect(html).toContain("Shopping and x402");
    expect(html).toContain("Requires capability");
    expect(html).toContain("Subscriptions");
    expect(html).toContain("Tokenized real-world assets");
    expect(html).toContain('href="/solvers"');
  });
});
