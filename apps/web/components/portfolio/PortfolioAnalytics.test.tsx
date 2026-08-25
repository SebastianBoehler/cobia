// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { IndexedPortfolioAnalytics } from "../../lib/portfolio/read-indexed-analytics";
import { PortfolioAnalytics } from "./PortfolioAnalytics";

afterEach(cleanup);

describe("PortfolioAnalytics", () => {
  it("keeps available activity visible when the PnL index is unavailable", () => {
    const analytics: IndexedPortfolioAnalytics = {
      status: "available",
      source: "okx-indexed",
      totalValue: { status: "unavailable", message: "Value unavailable." },
      recentPnl: {
        status: "unavailable",
        message: "Recent indexed PnL is temporarily unavailable.",
      },
      dexHistory: {
        status: "available",
        beginAt: "2026-07-26T10:00:00.000Z",
        endAt: "2026-08-25T10:00:00.000Z",
        items: [{
          type: "sell",
          token: "0x2222222222222222222222222222222222222222",
          symbol: "USDG",
          valueUsd: "120.00",
          amount: "120",
          priceUsd: "1.00",
          pnlUsd: "-2.50",
          occurredAt: "2026-08-25T09:50:00.000Z",
        }],
      },
    };

    render(<PortfolioAnalytics analytics={analytics} />);

    expect(screen.getByText("Recent indexed PnL is temporarily unavailable.")).toBeVisible();
    expect(screen.getByText("Sell USDG")).toBeVisible();
    expect(screen.getByText("−$2.50 PnL")).toBeVisible();
  });
});
