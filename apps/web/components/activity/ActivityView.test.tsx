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

  it("links current intent lifecycle and execution events to their proof pages", async () => {
    wallet.account = account;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ events: [{
      id: "intent-1:closed",
      kind: "intent_closed",
      status: "closed",
      routeId: null,
      transactionHash: null,
      detail: { intentId: "intent-1" },
      occurredAt: "2026-08-12T16:30:00.000Z",
    }, {
      id: "program-1:expired",
      kind: "program_expired",
      status: "expired",
      routeId: null,
      transactionHash: null,
      detail: { intentId: "intent-1", submissionId: "program-1" },
      occurredAt: "2026-08-12T16:30:30.000Z",
    }, {
      id: "program-1:executed",
      kind: "program_executed",
      status: "confirmed",
      routeId: null,
      transactionHash: `0x${"22".repeat(32)}`,
      detail: { intentId: "intent-1", submissionId: "program-2" },
      occurredAt: "2026-08-12T16:31:00.000Z",
    }] })));

    render(<ActivityView />);

    expect(await screen.findByRole("heading", { name: "Intent closed" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Program expired" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Program executed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View intent" }))
      .toHaveAttribute("href", "/intents/intent-1");
    expect(screen.getAllByRole("link", { name: "View program" }).map((link) => link.getAttribute("href")))
      .toEqual(["/programs/program-1", "/programs/program-2"]);
  });
});
