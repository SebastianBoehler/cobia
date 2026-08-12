// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { WalletScout } from "./WalletScout";

const asset = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
const snapshot = {
  address: "0x1111111111111111111111111111111111111111",
  chainId: 196,
  networkName: "X Layer Mainnet",
  blockNumber: "100",
  observedAt: "2026-08-12T10:00:00.000Z",
  native: { symbol: "OKB", amountAtomic: "0", formatted: "0" },
  balances: [{ address: asset, symbol: "USDG", amountAtomic: "10000000", formatted: "10" }],
  positions: [],
} satisfies PortfolioSnapshot;
const response = {
  markets: [{
    id: `196:${asset}`,
    executionChainId: 196,
    asset,
    requestAttemptCount: 1,
    quoteBearingAttemptCount: 1,
    latestActiveAttempt: {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      quotes: [{
        version: 2,
        quoteId: `0x${"ab".repeat(32)}`,
        estimatedPreGasApyBps: 240,
      }],
    },
    mostRecentAttempt: {},
  }],
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("WalletScout", () => {
  it("does not scan until the wallet owner opts in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletScout account="0x1111111111111111111111111111111111111111" snapshot={snapshot} />);

    expect(screen.getByRole("button", { name: "Enable Scout" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enable Scout" }));

    expect(await screen.findByText("2.40% estimated pre-gas APY")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review matched route" })).toHaveAttribute(
      "href",
      "/requests/550e8400-e29b-41d4-a716-446655440000",
    );
    expect(localStorage.getItem("cobia:scout:0x1111111111111111111111111111111111111111"))
      .toBe("enabled");
  });

  it("can be disabled without signing or executing", async () => {
    localStorage.setItem(
      "cobia:scout:0x1111111111111111111111111111111111111111",
      "enabled",
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ markets: [] })));

    render(<WalletScout account="0x1111111111111111111111111111111111111111" snapshot={snapshot} />);
    const button = await screen.findByRole("button", { name: "Disable Scout" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enable Scout" })).toBeEnabled());
    expect(screen.getByText(/never signs or executes/i)).toBeVisible();
  });
});
