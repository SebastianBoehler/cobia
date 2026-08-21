// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityView } from "./ActivityView";

const account = "0x1111111111111111111111111111111111111111";
const wallet = vi.hoisted(() => ({
  account: null as string | null,
  providers: [],
  selected: null,
  error: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => wallet,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityView", () => {
  it("offers wallet connection inside the empty state", () => {
    wallet.account = null;
    render(<ActivityView />);
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  });

  it("presents wallet events as a readable proof timeline", async () => {
    wallet.account = account;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ events: [{
      id: "event-1",
      kind: "route_revealed",
      status: "confirmed",
      routeId: `0x${"11".repeat(32)}`,
      transactionHash: `0x${"22".repeat(32)}`,
      occurredAt: "2026-08-12T16:30:00.000Z",
    }] })));

    render(<ActivityView />);

    expect(await screen.findByRole("heading", { name: "Route proof revealed" })).toBeVisible();
    expect(screen.getByText("Confirmed")).toBeVisible();
    expect(screen.getByText(/Transaction 0x22222222/)).toBeVisible();
    expect(screen.getByText("Archived route proof")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/wallets/${account}/activity`);
  });
});
