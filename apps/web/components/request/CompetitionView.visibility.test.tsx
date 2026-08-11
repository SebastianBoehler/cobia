// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { RouteQuote } from "@cobia/domain";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletProvider } from "../wallet/WalletProvider";
import { CompetitionView } from "./CompetitionView";

const nowSec = 1_800_000_000;
const requestId = "550e8400-e29b-41d4-a716-446655440000";

function quote(idByte: string, solverId: string, validUntil: number, executable = true): RouteQuote {
  return {
    version: 1,
    quoteId: `0x${idByte.repeat(64)}`,
    requestId,
    solverId,
    solverAddress: "0x1111111111111111111111111111111111111111",
    bundleHash: `0x${idByte.repeat(64)}`,
    expectedNetApyBps: 100,
    riskGrade: "unassessed",
    priceAtomic: "100000",
    validUntil,
    verification: {
      executable,
      errorCodes: executable ? [] : ["APY_BELOW_MINIMUM"],
      score: executable ? 100 : 0,
    },
  };
}

const eligible = quote("a", "eligible-solver", nowSec + 1);
const rejected = quote("b", "rejected-solver", nowSec + 1, false);
const expired = quote("c", "expired-solver", nowSec);
const policy = {
  version: 1 as const,
  requestId,
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196 as const,
  asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
  principalAtomic: "25000000000",
  maxProtocolExposureBps: 4_000,
  minTvlUsdE6: "250000000000",
  minNetApyBps: 200,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true as const,
};

function publicRequest(
  state: string,
  selectedQuoteId: string | null,
  quotes: RouteQuote[],
  paymentRecovery = state === "paid" ? "recover" : state === "payment_pending" ? "resume" : "none",
) {
  const nextExpirySec = quotes
    .filter((quote) => quote.verification.executable && quote.validUntil > nowSec)
    .reduce<number | null>((earliest, quote) =>
      earliest === null ? quote.validUntil : Math.min(earliest, quote.validUntil), null);
  return {
    requestId,
    state,
    policy,
    snapshot: null,
    selectedQuoteId,
    purchasedRouteId: state === "revealed" ? selectedQuoteId : null,
    paymentRecovery,
    freshness: { observedAtSec: nowSec, nextExpirySec },
    quotes,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CompetitionView quote visibility", () => {
  it("does not render rejected or expired quotes in an active competition", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("quotes_ready", null, [eligible, rejected, expired])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("eligible-solver")).toBeVisible();
    expect(screen.queryByText("rejected-solver")).not.toBeInTheDocument();
    expect(screen.queryByText("expired-solver")).not.toBeInTheDocument();
  });

  it("keeps an expired purchased quote available as historical detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("revealed", expired.quoteId, [eligible, expired])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("expired-solver")).toBeVisible();
    expect(screen.queryByText("eligible-solver")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View purchased route" }))
      .toHaveAttribute("href", `/routes/${expired.quoteId}`);
  });

  it("keeps an expired selection visible without offering settlement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("selected", expired.quoteId, [eligible, expired])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("expired-solver")).toBeVisible();
    expect(screen.getByText("Quote expired")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pay & reveal bundle" }))
      .not.toBeInTheDocument();
  });

  it("resumes an unexpired pending payment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("payment_pending", eligible.quoteId, [eligible])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("eligible-solver")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume payment" })).toBeVisible();
  });

  it("recovers a paid bundle after quote expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("paid", expired.quoteId, [expired])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("expired-solver")).toBeVisible();
    expect(screen.getByRole("button", { name: "Recover paid bundle" })).toBeVisible();
  });

  it("requires provider reconciliation instead of resuming a credentialed attempt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      publicRequest("payment_pending", eligible.quoteId, [eligible], "reconcile"),
    )));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByText("Payment reconciliation required")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resume payment" })).not.toBeInTheDocument();
  });

  it("refetches at the server-authoritative expiry without using wall-clock time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    const afterExpiry = {
      ...publicRequest("quotes_ready", null, []),
      freshness: { observedAtSec: nowSec + 1, nextExpirySec: null },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(publicRequest("quotes_ready", null, [eligible])))
      .mockResolvedValueOnce(Response.json(afterExpiry));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("eligible-solver")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("eligible-solver")).not.toBeInTheDocument();
  });

  it("expires active quotes locally when the expiry refresh fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(publicRequest("quotes_ready", null, [eligible])))
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Bundle recomputed")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(screen.queryByText("eligible-solver")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No eligible quote" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh unavailable");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains a selected quote as expired history when the expiry refresh fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(
        publicRequest("selected", eligible.quoteId, [eligible]),
      ))
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(screen.getByText("eligible-solver")).toBeVisible();
    expect(screen.getByText("Quote expired")).toBeVisible();
    expect(screen.getByText("Settlement unavailable")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh unavailable");
  });

  it("caps a far-future expiry timer before re-arming from the server", async () => {
    vi.useFakeTimers();
    const longLived = quote("d", "long-lived-solver", nowSec + 3_000_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(
        publicRequest("quotes_ready", null, [longLived]),
      ))
      .mockResolvedValueOnce(Response.json(publicRequest("quotes_ready", null, [])));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(2_147_000_000); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a far-future quote active when a capped refresh fails", async () => {
    vi.useFakeTimers();
    const longLived = quote("d", "long-lived-solver", nowSec + 3_000_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(
        publicRequest("quotes_ready", null, [longLived]),
      ))
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_147_000_000); });

    expect(screen.getByText("long-lived-solver")).toBeVisible();
    expect(screen.getByText("Bundle recomputed")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh unavailable");
  });

  it("explains when no active quote remains eligible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(publicRequest("quotes_ready", null, [rejected, expired])),
    ));

    render(<WalletProvider><CompetitionView requestId={requestId} /></WalletProvider>);

    expect(await screen.findByRole("heading", { name: "No eligible quote" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create fresh request" }))
      .toHaveAttribute("href", "/requests/new");
  });
});
