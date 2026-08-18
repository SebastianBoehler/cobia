import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/network/TestnetHome", () => ({ TestnetHome: () => null }));
vi.mock("@/lib/network/site-network-server", () => ({
  getSiteNetwork: async () => ({ mode: "mainnet", chainId: 196 }),
}));

import Home from "./page";

describe("home conversion path", () => {
  it("starts with the outcome and labels the example as a non-quote", async () => {
    const html = renderToStaticMarkup(await Home());
    const createIndex = html.indexOf("Create an intent");
    const exploreIndex = html.indexOf("Browse solver market");

    expect(createIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(createIndex);
    expect(html).toContain('href="/requests/new"');
    expect(html).toContain("State the outcome");
    expect(html).toContain("Example intent");
    expect(html).toContain("Example request · not a live quote");
    expect(html).not.toContain("home-eyebrow");
    expect(html).not.toContain("10.08");
  });

  it("keeps solver creativity separate from verification and wallet approval", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Solvers search");
    expect(html).toContain("Cobia verifies");
    expect(html).toContain("You approve");
    expect(html).toContain("never receives your private key");
    expect(html).toContain("Broadcast only to a disposable fork");
  });

  it("makes the wallet product visible before technical architecture", async () => {
    const html = renderToStaticMarkup(await Home());
    const positionsIndex = html.indexOf("View positions");
    const activityIndex = html.indexOf("Review activity");
    const architectureIndex = html.indexOf("Creative route search");

    expect(positionsIndex).toBeGreaterThan(-1);
    expect(activityIndex).toBeGreaterThan(positionsIndex);
    expect(architectureIndex).toBeGreaterThan(activityIndex);
  });
});
