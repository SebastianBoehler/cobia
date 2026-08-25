// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntentAvailableAssets } from "./IntentAvailableAssets";

const assets = ["OKB", "USDG", "USDt0", "aXlrUSDG", "PAXG", "TSLAx"].map((symbol, index) => ({
  symbol, amount: String(index + 1), priceUsd: "1",
}));

afterEach(cleanup);

describe("IntentAvailableAssets", () => {
  it("bounds the visible shortcuts and keeps remaining wallet assets reachable", () => {
    render(<IntentAvailableAssets assets={assets} onSelect={vi.fn()} state="ready" />);

    const shortcuts = screen.getByRole("list", { name: "Wallet balance shortcuts" });
    expect(shortcuts.children).toHaveLength(5);
    expect(screen.getByLabelText("Show 2 more wallet assets").closest("details")).not.toHaveAttribute("open");
    expect(within(screen.getByLabelText("More wallet balance shortcuts"))
      .getByRole("button", { name: /Add @PAXG to goal/ })).toBeInTheDocument();
  });

  it("adds an asset selected from the overflow menu", () => {
    const onSelect = vi.fn();
    render(<IntentAvailableAssets assets={assets} onSelect={onSelect} state="ready" />);

    fireEvent.click(within(screen.getByLabelText("More wallet balance shortcuts"))
      .getByRole("button", { name: /Add @PAXG to goal/ }));

    expect(onSelect).toHaveBeenCalledWith(assets[4]);
  });
});
