// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletProvider } from "../wallet/WalletProvider";
import { TestnetHome } from "./TestnetHome";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("../wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TestnetHome", () => {
  it("shows live paused deployment evidence without implying route execution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      chainId: 1952,
      blockNumber: "38600000",
      observedAt: "2026-08-18T09:00:00.000Z",
      state: "paused",
      contracts: {
        registry: { address: "0xb0B2bd226b07cD2b83DB51306f12aa29a8Cbd1a5", verified: true },
        riskManager: { address: "0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877", verified: true },
        executor: { address: "0x4029dD2e07f7951e52Fa67E64573B0e5DB3225ab", verified: true },
      },
    })));

    render(<WalletProvider targetChainId={1952}><TestnetHome /></WalletProvider>);

    expect(screen.getByRole("heading", { name: "Test safely on X Layer." })).toBeVisible();
    expect(screen.getByText("Chain 1952")).toBeVisible();
    expect(screen.getByText("Execution locked")).toBeVisible();
    expect(await screen.findByText("Verified at block 38,600,000")).toBeVisible();
    expect(screen.getAllByText("Code verified")).toHaveLength(3);
    expect(screen.getByText(/Testnet tokens have no cash value/i)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/api/network/status", { cache: "no-store" });
  });
});
