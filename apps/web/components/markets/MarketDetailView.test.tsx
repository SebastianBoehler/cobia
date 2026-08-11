// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MarketAttempt, StoredMarketDetail } from "../../lib/db/markets";
import { WalletProvider } from "../wallet/WalletProvider";
import { MarketDetailView } from "./MarketDetailView";

const asset = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";

function attempt(requestId: string, solverId: string, active: boolean): MarketAttempt {
  return {
    requestId,
    policy: {
      version: 1,
      requestId,
      owner: "0x1111111111111111111111111111111111111111",
      executionChainId: 196,
      asset,
      principalAtomic: "25000000",
      maxProtocolExposureBps: 4_000,
      minTvlUsdE6: "1000000",
      minNetApyBps: 0,
      maxSnapshotAgeSec: 300,
      deadline: 2_000_000_000,
      noBridges: true,
    },
    quotes: [{
      version: 1,
      quoteId: `0x${requestId.replaceAll("-", "").padEnd(64, "0").slice(0, 64)}`,
      requestId,
      solverId,
      solverAddress: "0x1111111111111111111111111111111111111111",
      bundleHash: `0x${"ab".repeat(32)}`,
      expectedNetApyBps: 90,
      riskGrade: "unassessed",
      priceAtomic: "100000",
      validUntil: 2_000_000_000,
      verification: { executable: true, errorCodes: [], score: 90 },
    }],
    state: "quotes_ready",
    lifecycle: "completed",
    quoteEligibility: active ? "active" : "inactive",
    blockNumber: "1000",
    sourceApyBps: 240,
    protocols: ["Aave V3"],
    createdAt: "2026-08-11T00:00:00.000Z",
  };
}

afterEach(cleanup);

describe("MarketDetailView", () => {
  it("keeps the active attempt as the primary quote while showing newer history separately", () => {
    const active = attempt("550e8400-e29b-41d4-a716-446655440000", "active-solver", true);
    const expired = attempt("650e8400-e29b-41d4-a716-446655440000", "expired-solver", false);
    const market = {
      id: `196:${asset.toLowerCase()}`,
      executionChainId: 196,
      asset,
      latestActiveAttempt: active,
      mostRecentAttempt: expired,
      requestAttemptCount: 2,
      quoteBearingAttemptCount: 2,
      attempts: [expired, active],
      nextCursor: null,
    } as StoredMarketDetail;

    render(<WalletProvider><MarketDetailView market={market} /></WalletProvider>);

    expect(screen.getByRole("heading", { name: "Current eligible quote" })).toBeVisible();
    expect(screen.getByText("active-solver")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review active quote" }))
      .toHaveAttribute("href", `/requests/${active.requestId}`);
    expect(screen.getByRole("heading", { name: "Recent request attempts" })).toBeVisible();
    expect(screen.getByText("expired-solver")).toBeVisible();
  });

  it("renders an unfinished attempt as running without a review-quote call to action", () => {
    const running = {
      ...attempt("750e8400-e29b-41d4-a716-446655440000", "unused", false),
      state: "collecting",
      lifecycle: "running" as const,
      quoteEligibility: "none" as const,
      quotes: [],
    };
    const market = {
      id: `196:${asset.toLowerCase()}`,
      executionChainId: 196,
      asset,
      latestActiveAttempt: null,
      mostRecentAttempt: running,
      requestAttemptCount: 1,
      quoteBearingAttemptCount: 0,
      attempts: [running],
      nextCursor: null,
    } as StoredMarketDetail;

    render(<WalletProvider><MarketDetailView market={market} /></WalletProvider>);

    expect(screen.getByText("Running")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Review .*quote/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View request status" }))
      .toHaveAttribute("href", `/requests/${running.requestId}`);
  });

  it("shows a V2 route as estimated pre-gas without verifier-score or net claims", () => {
    const requestId = "850e8400-e29b-41d4-a716-446655440000";
    const routeAttempt = {
      ...attempt(requestId, "unused", true),
      requestId,
      policy: {
        version: 2,
        requestId,
        owner: "0x1111111111111111111111111111111111111111",
        executionChainId: 196,
        asset: asset.toLowerCase(),
        principalAtomic: "25000000",
        protocolExposureBps: 4_000,
        minTvlUsdE6: "1000000",
        minPreGasApyBps: 0,
        maxSnapshotAgeSec: 300,
        deadline: 2_000_000_000,
        noBridges: true,
        allowedOutputAssets: [
          "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
          "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        ],
        allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
        maxSlippageBps: 100,
        horizonDays: 30,
      },
      quotes: [{
        version: 2,
        quoteId: `0x${"ef".repeat(32)}`,
        requestId,
        solverId: "route-solver",
        solverAddress: "0x1111111111111111111111111111111111111111",
        bundleHash: `0x${"ef".repeat(32)}`,
        estimatedPreGasApyBps: 120,
        riskGrade: "unassessed",
        priceAtomic: "100000",
        validUntil: 2_000_000_000,
        authorization: { routeAuthorized: true, errorCodes: [] },
      }],
      protocols: ["Aave V3", "Uniswap V3"],
    } as MarketAttempt;
    const market = {
      id: `196:${asset.toLowerCase()}`,
      executionChainId: 196,
      asset,
      latestActiveAttempt: routeAttempt,
      mostRecentAttempt: routeAttempt,
      requestAttemptCount: 1,
      quoteBearingAttemptCount: 1,
      attempts: [routeAttempt],
      nextCursor: null,
    } as StoredMarketDetail;

    render(<WalletProvider><MarketDetailView market={market} /></WalletProvider>);

    expect(screen.getByText("route-solver")).toBeVisible();
    expect(screen.getByText(/estimated pre-gas APY/)).toBeVisible();
    expect(screen.getByText(/Snapshot protocols: Aave V3, Uniswap V3/)).toBeVisible();
    expect(screen.getByText("1.20%")).toBeVisible();
    expect(screen.queryByText(/net APY|verifier score|executable/i))
      .not.toBeInTheDocument();
  });
});
