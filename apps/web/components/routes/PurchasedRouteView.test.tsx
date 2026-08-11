// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchasedRouteView, type PurchasedRoute } from "./PurchasedRouteView";

const route: PurchasedRoute = {
  id: `0x${"ab".repeat(32)}`,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  quoteId: `0x${"ab".repeat(32)}`,
  buyer: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  paymentChainId: 1952,
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
  snapshot: {
    version: 1,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    chainId: 196,
    blockNumber: "1000",
    blockHash: `0x${"44".repeat(32)}`,
    capturedAt: "2026-08-10T18:59:00.000Z",
    asset: {
      address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      symbol: "USDT",
      decimals: 6,
    },
    candidates: [{
      id: "cash:usdt",
      kind: "cash",
      apyBps: 0,
      tvlUsdE6: "0",
      retrievedAt: "2026-08-10T18:59:00.000Z",
    }],
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
    expect(screen.getByText("10,000 USDt0 quoted for Aave V3")).toBeVisible();
    expect(screen.getByText("0.09% expected net APY")).toBeVisible();
    expect(screen.getByText("Principal unmoved")).toBeVisible();
  });

  it("assigns an odd-principal remainder to the displayed cash amount", () => {
    const oddPrincipalRoute: PurchasedRoute = {
      ...route,
      policy: { ...route.policy, principalAtomic: "25000000001" },
    };

    const view = render(<PurchasedRouteView route={oddPrincipalRoute} />);

    const oddRoute = within(view.container);
    expect(oddRoute.getByText("15,000.000001 USDt0 retained")).toBeVisible();
    expect(
      oddRoute.getByText("10,000 USDt0 quoted for Aave V3"),
    ).toBeVisible();
  });

  it("renders zero for an unselected zero-BPS Aave allocation", () => {
    const routeWithUnusedAave: PurchasedRoute = {
      ...route,
      bundle: {
        ...route.bundle,
        allocations: [
          { candidateId: "cash:usdt", bps: 6_000 },
          { candidateId: "aave-v3:33905", bps: 4_000 },
          { candidateId: "aave-v3:unused", bps: 0 },
        ],
      },
    };

    const view = render(<PurchasedRouteView route={routeWithUnusedAave} />);
    const steps = within(view.container).getAllByRole("listitem");

    expect(within(steps[0]).getByText("15,000 USDt0 retained")).toBeVisible();
    expect(
      within(steps[1]).getByText("10,000 USDt0 quoted for Aave V3"),
    ).toBeVisible();
    expect(
      within(steps[2]).getByText("0 USDt0 quoted for Aave V3"),
    ).toBeVisible();
  });

  it("assigns the cash remainder to only one of multiple cash rows", () => {
    const routeWithReserveCash: PurchasedRoute = {
      ...route,
      bundle: {
        ...route.bundle,
        allocations: [
          { candidateId: "cash:usdt", bps: 6_000 },
          { candidateId: "cash:reserve", bps: 0 },
          { candidateId: "aave-v3:33905", bps: 4_000 },
        ],
      },
    };

    const view = render(<PurchasedRouteView route={routeWithReserveCash} />);
    const steps = within(view.container).getAllByRole("listitem");

    expect(within(steps[0]).getByText("15,000 USDt0 retained")).toBeVisible();
    expect(within(steps[1]).getByText("0 USDt0 retained")).toBeVisible();
    expect(
      within(steps[2]).getByText("10,000 USDt0 quoted for Aave V3"),
    ).toBeVisible();
  });

  it("conserves an odd principal across multiple cash rows exactly once", () => {
    const oddPrincipal = "25000000001";
    const routeWithReserveCash: PurchasedRoute = {
      ...route,
      policy: { ...route.policy, principalAtomic: oddPrincipal },
      bundle: {
        ...route.bundle,
        allocations: [
          { candidateId: "cash:usdt", bps: 6_000 },
          { candidateId: "cash:reserve", bps: 0 },
          { candidateId: "aave-v3:33905", bps: 4_000 },
        ],
      },
    };

    const view = render(<PurchasedRouteView route={routeWithReserveCash} />);
    const steps = within(view.container).getAllByRole("listitem");

    expect(
      within(steps[0]).getByText("15,000.000001 USDt0 retained"),
    ).toBeVisible();
    expect(within(steps[1]).getByText("0 USDt0 retained")).toBeVisible();
    expect(
      within(steps[2]).getByText("10,000 USDt0 quoted for Aave V3"),
    ).toBeVisible();
    expect(15_000_000_001n + 0n + 10_000_000_000n).toBe(BigInt(oddPrincipal));
  });
});
