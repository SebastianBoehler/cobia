// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityView } from "./ActivityView";

const account = "0x1111111111111111111111111111111111111111";

vi.mock("../wallet/WalletProvider", () => ({
  useWallet: () => ({ account }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityView", () => {
  it("presents wallet events as a readable proof timeline", async () => {
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
    expect(fetch).toHaveBeenCalledWith(`/api/wallets/${account}/activity`, { cache: "no-store" });
  });
});
