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

    expect(html).toContain("<h1>Route markets</h1>");
    expect(html).toContain("<h2>No solver markets yet</h2>");
    expect(html).toContain("Create an intent");
    expect(html).not.toContain("No stored quotes yet");
  });

  it("separates live solver results from non-executable past discoveries", async () => {
    listMarkets.mockResolvedValue([{}]);

    const html = renderToStaticMarkup(await MarketsPage());

    expect(html).toContain("live solver results and past discoveries");
    expect(html).toContain("cannot be selected or executed");
    expect(html).toContain("fresh wallet-specific intent and verification");
  });
});
