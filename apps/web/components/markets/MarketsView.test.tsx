// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MarketAttempt, StoredMarketSummary } from "../../lib/db/markets";
import { WalletProvider } from "../wallet/WalletProvider";
import { MarketsView } from "./MarketsView";

const marketId = "196:0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";

function currentAttempt(): MarketAttempt {
  return {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    policy: {
      version: 1,
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: "0x1111111111111111111111111111111111111111",
      executionChainId: 196,
      asset: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
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
      expectedNetApyBps: 90,
      riskGrade: "unassessed",
      quoteId: `0x${"ab".repeat(32)}`,
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      solverId: "determinist",
      solverAddress: "0x1111111111111111111111111111111111111111",
      bundleHash: `0x${"ab".repeat(32)}`,
      priceAtomic: "100000",
      validUntil: 2_000_000_000,
      verification: { executable: true, errorCodes: [], score: 90 },
    }],
    state: "quotes_ready",
    lifecycle: "completed",
    quoteEligibility: "active",
    blockNumber: "1000",
    sourceApyBps: 240,
    protocols: ["Aave V3"],
    createdAt: "2026-08-11T00:00:00.000Z",
  };
}

afterEach(cleanup);

describe("MarketsView", () => {
  it("renders persisted round count and the canonical market link without client grouping", () => {
    const active = currentAttempt();
    const market: StoredMarketSummary = {
      id: marketId,
      executionChainId: 196,
      asset: active.policy.asset,
      latestActiveAttempt: active,
      mostRecentAttempt: active,
      requestAttemptCount: 2,
      quoteBearingAttemptCount: 2,
    };

    render(<WalletProvider><MarketsView markets={[market]} /></WalletProvider>);

    expect(screen.getByText(/2 request attempts · 2 with quotes/)).toBeVisible();
    expect(screen.getByText(/snapshot-derived portfolio APY/)).toBeVisible();
    expect(screen.queryByText(/net APY/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View quote" }))
      .toHaveAttribute("href", `/markets/${marketId}`);
  });

  it("labels V2 economics as estimated pre-gas and names both routed protocols", () => {
    const requestId = "650e8400-e29b-41d4-a716-446655440000";
    const active = {
      ...currentAttempt(),
      requestId,
      policy: {
        version: 2,
        requestId,
        owner: "0x1111111111111111111111111111111111111111",
        executionChainId: 196,
        asset: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
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
        quoteId: `0x${"cd".repeat(32)}`,
        requestId,
        solverId: "route-solver",
        solverAddress: "0x1111111111111111111111111111111111111111",
        bundleHash: `0x${"cd".repeat(32)}`,
        estimatedPreGasApyBps: 120,
        riskGrade: "unassessed",
        priceAtomic: "100000",
        validUntil: 2_000_000_000,
        authorization: { routeAuthorized: true, errorCodes: [] },
      }],
      sourceApyBps: 240,
      protocols: ["Aave V3", "Uniswap V3"],
    } as MarketAttempt;
    const market: StoredMarketSummary = {
      id: marketId,
      executionChainId: 196,
      asset: active.policy.asset,
      latestActiveAttempt: active,
      mostRecentAttempt: active,
      requestAttemptCount: 1,
      quoteBearingAttemptCount: 1,
    };

    render(<WalletProvider><MarketsView markets={[market]} /></WalletProvider>);

    expect(screen.getByText(/estimated pre-gas APY/)).toBeVisible();
    expect(screen.getByText(
      /Snapshot protocols: Aave V3, Uniswap V3 · highest Aave supply rate/,
    )).toBeVisible();
    expect(screen.getByText(/40% signed protocol exposure/)).toBeVisible();
    expect(screen.queryByText(/net APY/i)).not.toBeInTheDocument();
  });

  it("shows the latest historical route when no live quote remains", () => {
    const historical = {
      ...currentAttempt(),
      quoteEligibility: "inactive" as const,
    };
    const market: StoredMarketSummary = {
      id: marketId,
      executionChainId: 196,
      asset: historical.policy.asset,
      latestActiveAttempt: null,
      mostRecentAttempt: historical,
      requestAttemptCount: 3,
      quoteBearingAttemptCount: 3,
    };

    render(<WalletProvider><MarketsView markets={[market]} /></WalletProvider>);

    expect(screen.getByText("historical")).toBeVisible();
    expect(screen.getByText(/Last authorized estimate/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review route history" }))
      .toHaveAttribute("href", `/markets/${marketId}`);
    expect(screen.queryByRole("link", { name: "View live quote" }))
      .not.toBeInTheDocument();
  });
});
