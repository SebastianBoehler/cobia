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
  it("distinguishes mainnet quote inputs from balance personalization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      address: owner,
      chainId: 1952,
      networkName: "X Layer Testnet",
      blockNumber: "123",
      observedAt: "2026-08-11T00:00:00.000Z",
      native: { symbol: "OKB", amountAtomic: "0", formatted: "0" },
      balances: [],
      positions: [],
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

    expect(await screen.findByText(
      "Testnet assets are for payment rehearsal only. V2 quote construction reads registered Aave V3 and Uniswap V3 contracts at one pinned X Layer mainnet block; mainnet wallet balances personalize listings and estimates.",
    )).toBeVisible();
  });
});
