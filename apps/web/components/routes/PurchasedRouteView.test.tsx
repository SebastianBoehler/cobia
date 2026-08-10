// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchasedRouteView, type PurchasedRoute } from "./PurchasedRouteView";

const route: PurchasedRoute = {
  id: `0x${"ab".repeat(32)}`,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  quoteId: `0x${"ab".repeat(32)}`,
  buyer: "0x1111111111111111111111111111111111111111",
  chainId: 196,
  receiptHash: `0x${"cd".repeat(32)}`,
  purchasedAt: "2026-08-10T19:00:00.000Z",
  policy: {
    version: 1,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    owner: "0x1111111111111111111111111111111111111111",
    executionChainId: 196,
    asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 0,
    maxSnapshotAgeSec: 300,
    deadline: 2_000_000_000,
    noBridges: true,
  },
  bundle: {
    version: 1,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    solverId: "deterministic",
    solverAddress: "0x2222222222222222222222222222222222222222",
    policyHash: `0x${"11".repeat(32)}`,
    snapshotHash: `0x${"22".repeat(32)}`,
    allocations: [
      { candidateId: "cash:usdt", bps: 6_000 },
      { candidateId: "aave-v3:33905", bps: 4_000 },
    ],
    evidence: [],
    riskFlags: [],
    expectedNetApyBps: 9,
    action: {
      kind: "aave-v3-supply",
      candidateId: "aave-v3:33905",
      investmentId: "33905",
      amountAtomic: "10000000000",
    },
    validUntil: 2_000_000_000,
    signature: `0x${"33".repeat(65)}`,
  },
};

describe("PurchasedRouteView", () => {
  it("shows retained and deployed capital as route steps", () => {
    render(<PurchasedRouteView route={route} />);
    expect(screen.getByText("15,000 USDt0 retained")).toBeVisible();
    expect(screen.getByText("10,000 USDt0 supplied to Aave V3")).toBeVisible();
    expect(screen.getByText("0.09% expected net APY")).toBeVisible();
    expect(screen.getByText("Balance check required")).toBeVisible();
  });
});
