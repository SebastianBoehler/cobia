// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("offers wallet connection inside the empty state", () => {
    render(<WalletProvider><PortfolioView /></WalletProvider>);
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  });

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
      analytics: {
        status: "available",
        source: "okx-indexed",
        totalValue: { status: "available", totalValueUsd: "1450.25",
          fetchedAt: "2026-08-25T10:00:00.000Z" },
        recentPnl: { status: "available", items: [{
          token: "0x2222222222222222222222222222222222222222",
          symbol: "USDG",
          lastActiveAt: "2026-08-25T09:50:00.000Z",
          totalPnlUsd: "18.25",
          totalPnlPercent: "2.30",
          realizedPnlUsd: "12.50",
          unrealizedPnlUsd: "5.75",
          balanceUsd: "1060.00",
        }] },
        dexHistory: { status: "available", beginAt: "2026-07-26T10:00:00.000Z",
          endAt: "2026-08-25T10:00:00.000Z", items: [{
            type: "buy",
            token: "0x2222222222222222222222222222222222222222",
            symbol: "USDG",
            valueUsd: "250.00",
            amount: "250",
            priceUsd: "1.00",
            pnlUsd: "4.50",
            occurredAt: "2026-08-25T09:50:00.000Z",
          }] },
      },
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
          if (method === "wallet_switchEthereumChain") return null;
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
    fireEvent.click(screen.getAllByRole("button", { name: "Connect wallet" })[0]!);

    expect(await screen.findByText("X Layer Mainnet")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/wallets/${owner}/portfolio?chainId=196`,
    );
    expect(screen.queryByText(/payment rehearsal/i)).not.toBeInTheDocument();
    const walletBalances = screen.getByRole("heading", { name: "Wallet balances" }).closest("section");
    expect(walletBalances).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Protocol positions" })).toBeVisible();
    expect(screen.getByRole("img", { name: "OKB token" })).toBeVisible();
    expect(within(walletBalances!).getByRole("img", { name: "USDG token" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Aave V3" })).toBeVisible();
    expect(screen.getByText("12.5 USDG")).toBeVisible();
    expect(screen.getByText("4.25 aUSDG")).toBeVisible();
    expect(screen.getByText("$1,450.25")).toBeVisible();
    expect(screen.getByText("Aug 25, 10:00 AM UTC")).toBeVisible();
    expect(screen.getAllByText(/OKX-indexed/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "PnL by asset" })).toBeVisible();
    expect(screen.getByText("+$18.25")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recent DEX activity" })).toBeVisible();
    expect(screen.getByText("Buy USDG")).toBeVisible();
    expect(screen.getByText("$250.00")).toBeVisible();
  });

  it("reads chain 1952 on the testnet host and omits unsupported protocol positions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      address: owner,
      chainId: 1952,
      networkName: "X Layer Testnet",
      blockNumber: "38600000",
      observedAt: "2026-08-18T09:00:00.000Z",
      native: { symbol: "OKB", amountAtomic: "1000000000000000", formatted: "0.001" },
      balances: [],
      positions: [],
    })));
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "testnet", name: "OKX", icon: "data:image/svg+xml,<svg/>", rdns: "okx.test" },
      provider: { request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return [owner];
        if (method === "eth_chainId") return "0x7a0";
        throw new Error(`Unexpected wallet method ${method}`);
      }) },
    };

    render(<WalletProvider targetChainId={1952}><WalletButton /><PortfolioView /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getAllByRole("button", { name: "Connect wallet" })[0]!);

    expect(await screen.findByText("X Layer Testnet")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(`/api/wallets/${owner}/portfolio?chainId=1952`);
    expect(screen.getByText("0.001 OKB")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Protocol positions" })).not.toBeInTheDocument();
  });
});
