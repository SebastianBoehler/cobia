import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMarkets = vi.fn();

vi.mock("@/components/layout/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/markets/MarketsView", () => ({ MarketsView: () => null }));
vi.mock("@/components/product/ProductShell.module.css", () => ({
  default: { page: "page", heading: "heading", empty: "empty" },
}));
vi.mock("@/lib/runtime/market", () => ({
  getMarketRepository: () => ({ listMarkets }),
}));
vi.mock("@/lib/time", () => ({ currentUnixSeconds: () => 1_800_000_000 }));

import MarketsPage from "./page";

afterEach(() => {
  listMarkets.mockReset();
});

describe("MarketsPage", () => {
  it("describes an empty eligibility view without claiming the database is empty", async () => {
    listMarkets.mockResolvedValue([]);

    const html = renderToStaticMarkup(await MarketsPage());

    expect(html).toContain("<h2>No active quotes</h2>");
    expect(html).not.toContain("No stored quotes yet");
  });

  it("does not describe mixed V1/V2 market eligibility as route execution", async () => {
    listMarkets.mockResolvedValue([{}]);

    const html = renderToStaticMarkup(await MarketsPage());

    expect(html).toContain("Aave V3, Curve StableSwap NG, and Uniswap V3 opportunities");
    expect(html).not.toContain("verifier-executable");
  });
});
