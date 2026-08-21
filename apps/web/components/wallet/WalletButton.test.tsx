// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Eip1193Provider, Eip6963ProviderDetail } from "../../lib/wallet/eip1193";
import { AppHeader } from "../layout/AppHeader";
import { WalletProvider } from "./WalletProvider";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AppHeader wallet control", () => {
  it("offers wallet connection instead of a duplicate market link", () => {
    render(<AppHeader />);

    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open market" })).not.toBeInTheDocument();
  });

  it("connects an announced provider and follows account changes", async () => {
    const listeners = new Map<string, (value: unknown) => void>();
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"];
        if (method === "eth_chainId") return "0xc4";
        throw new Error(`Unexpected method ${method}`);
      }),
      on: (event, listener) => listeners.set(event, listener),
      removeListener: (event) => listeners.delete(event),
    };
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "phantom", name: "Phantom", icon: "data:image/svg+xml,<svg/>", rdns: "app.phantom" },
      provider,
    };
    render(<WalletProvider><AppHeader /></WalletProvider>);

    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(await screen.findByRole("button", { name: /Phantom · 0x1111…1111/ })).toBeVisible();
    await waitFor(() => expect(listeners.has("accountsChanged")).toBe(true));
    act(() => listeners.get("accountsChanged")?.(["0x2222222222222222222222222222222222222222"]));
    expect(await screen.findByRole("button", { name: /Phantom · 0x2222…2222/ })).toBeVisible();
  });

  it("restores the selected wallet after a full provider remount without prompting", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      if (method === "eth_chainId") return "0xc4";
      throw new Error(`Unexpected method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "okx-session-1", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" },
      provider: { request },
    };
    const first = render(<WalletProvider><AppHeader /></WalletProvider>);

    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(await screen.findByRole("button", { name: /OKX Wallet · 0x1111…1111/ })).toBeVisible();
    first.unmount();

    const reloadedDetail = { ...detail, info: { ...detail.info, uuid: "okx-session-2" } };
    render(<WalletProvider><AppHeader /></WalletProvider>);
    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: reloadedDetail })));

    expect(await screen.findByRole("button", { name: /OKX Wallet · 0x1111…1111/ })).toBeVisible();
    expect(request.mock.calls.filter(([input]) => input.method === "eth_requestAccounts")).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({ method: "eth_accounts" });
  });

  it("surfaces a rejected wallet connection", async () => {
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "okx", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" },
      provider: { request: vi.fn().mockRejectedValue(new Error("Connection rejected")) },
    };
    render(<WalletProvider><AppHeader /></WalletProvider>);

    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connection rejected");
  });

  it("switches a wallet connected on mainnet to the hostname-bound testnet", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"];
      if (method === "eth_chainId") return "0xc4";
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(`Unexpected method ${method}`);
    });
    const detail: Eip6963ProviderDetail = {
      info: { uuid: "okx-testnet", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" },
      provider: { request },
    };
    render(<WalletProvider targetChainId={1952}><AppHeader /></WalletProvider>);

    act(() => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail })));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a0" }],
    }));
  });
});
