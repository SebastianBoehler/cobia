// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { WalletButton } from "../wallet/WalletButton";
import { WalletProvider } from "../wallet/WalletProvider";
import { PortfolioView } from "./PortfolioView";

const owner = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PortfolioView", () => {
  it("reads the coherent mainnet portfolio even when the wallet starts on testnet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      address: owner,
      chainId: 196,
      networkName: "X Layer Mainnet",
      blockNumber: "123",
      observedAt: "2026-08-11T00:00:00.000Z",
      native: { symbol: "OKB", amountAtomic: "0", formatted: "0" },
      balances: [{
        address: "0x2222222222222222222222222222222222222222",
        symbol: "USDG",
        amountAtomic: "12500000",
        formatted: "12.5",
      }],
      positions: [{
        adapterId: "aave-v3@1",
        symbol: "aUSDG",
        amountAtomic: "4250000",
        formatted: "4.25",
      }],
    })));
    const detail: Eip6963ProviderDetail = {
      info: {
        uuid: "testnet-wallet",
        name: "Testnet Wallet",
        icon: "data:image/svg+xml,<svg/>",
        rdns: "example.testnet",
      },
      provider: {
        request: vi.fn(async ({ method }) => {
          if (method === "eth_requestAccounts") return [owner];
          if (method === "eth_chainId") return "0x7a0";
          throw new Error(`Unexpected wallet method ${method}`);
        }),
      },
    };

    render(
      <WalletProvider>
        <WalletButton />
        <PortfolioView />
      </WalletProvider>,
    );
    act(() => window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", { detail }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(await screen.findByText("X Layer Mainnet")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/wallets/${owner}/portfolio?chainId=196`,
      { cache: "no-store" },
    );
    expect(screen.queryByText(/payment rehearsal/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wallet balances" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Protocol positions" })).toBeVisible();
    expect(screen.getByRole("img", { name: "OKB token" })).toBeVisible();
    expect(screen.getByRole("img", { name: "USDG token" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Aave V3" })).toBeVisible();
    expect(screen.getByText("12.5 USDG")).toBeVisible();
    expect(screen.getByText("4.25 aUSDG")).toBeVisible();
  });
});
