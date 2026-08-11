// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { StablecoinPolicyV2Schema } from "@cobia/domain";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRepositoryFixtureV2 } from "../../lib/db/repository-test-fixtures";
import { PurchasedRouteView, type PurchasedRoute } from "./PurchasedRouteView";

describe("PurchasedRouteView V2", () => {
  it("explains retained capital and renders ordered adapter actions", async () => {
    const fixture = await createRepositoryFixtureV2();
    const route: PurchasedRoute = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: fixture.policy.owner.toLowerCase(),
      executionChainId: 196,
      paymentChainId: 1952,
      receiptHash: `0x${"cd".repeat(32)}`,
      purchasedAt: "2026-08-10T19:00:00.000Z",
      policy: StablecoinPolicyV2Schema.parse(fixture.policy),
      snapshot: fixture.snapshot,
      bundle: fixture.bundle,
      rehearsalRealm: "localhost:3000",
      rehearsal: null,
    };

    render(<PurchasedRouteView route={route} />);

    expect(screen.getByText("0.23% estimated pre-gas APY")).toBeVisible();
    expect(screen.getByText("Principal unmoved")).toBeVisible();
    const steps = screen.getAllByRole("listitem");
    expect(within(steps[0]).getByText("10.000001 USDt0 retained")).toBeVisible();
    expect(within(steps[0]).getByText(
      "Undeployed by the signed 60% protocol-exposure limit; this amount earns no route yield",
    )).toBeVisible();
    expect(within(steps[1]).getByText(
      "Swap 15 USDt0 for at least 14.85 USDG via Uniswap V3",
    )).toBeVisible();
    expect(within(steps[2]).getByText(
      "Supply up to the quoted 15 USDG to Aave V3",
    )).toBeVisible();
    expect(within(steps[2]).getByText(
      /favorable-fill surplus remains in your wallet/,
    )).toBeVisible();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("uses committed snapshot decimals for a route asset outside the display registry", async () => {
    const fixture = await createRepositoryFixtureV2();
    const unknownAsset = "0x9999999999999999999999999999999999999999" as const;
    const [leg] = fixture.bundle.routePlan.legs;
    if (!leg || leg.actions[0].kind !== "uniswap-v3-exact-input") {
      throw new Error("Expected swap fixture");
    }
    const [swap, supply] = leg.actions;
    const route = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: fixture.policy.owner.toLowerCase(),
      executionChainId: 196,
      paymentChainId: 1952,
      receiptHash: `0x${"cd".repeat(32)}`,
      purchasedAt: "2026-08-10T19:00:00.000Z",
      policy: StablecoinPolicyV2Schema.parse(fixture.policy),
      snapshot: {
        ...fixture.snapshot,
        valuations: fixture.snapshot.valuations.map((valuation) =>
          valuation.asset === swap.tokenOut
            ? { ...valuation, asset: unknownAsset, decimals: 18 }
            : valuation),
      },
      bundle: {
        ...fixture.bundle,
        routePlan: {
          ...fixture.bundle.routePlan,
          legs: [{
            ...leg,
            actions: [{
              ...swap,
              tokenOut: unknownAsset,
              quotedOutputAtomic: "1500000000000000000",
              minimumOutputAtomic: "1400000000000000000",
            }, {
              ...supply,
              asset: unknownAsset,
            }],
          }],
        },
      },
    } as unknown as PurchasedRoute;

    render(<PurchasedRouteView route={route} />);

    expect(screen.getByText(
      "Swap 15 USDt0 for at least 1.4 0x999999…999999 via Uniswap V3",
    )).toBeVisible();
  });

  it("presents a one-sided LP route and labels fee APY as historical", async () => {
    const fixture = await createRepositoryFixtureV2();
    const [leg] = fixture.bundle.routePlan.legs;
    if (!leg || leg.actions[0].kind !== "uniswap-v3-exact-input") {
      throw new Error("Expected swap fixture");
    }
    const input = leg.actions[0].tokenIn;
    const output = leg.actions[0].tokenOut;
    const opportunityId = "uniswap-v3-lp:retail";
    const route = {
      id: fixture.quote.quoteId,
      requestId: fixture.policy.requestId,
      quoteId: fixture.quote.quoteId,
      buyer: fixture.policy.owner.toLowerCase(),
      executionChainId: 196,
      paymentChainId: 1952,
      receiptHash: `0x${"cd".repeat(32)}`,
      purchasedAt: "2026-08-10T19:00:00.000Z",
      policy: StablecoinPolicyV2Schema.parse(fixture.policy),
      snapshot: {
        ...fixture.snapshot,
        opportunities: [...fixture.snapshot.opportunities, {
          id: opportunityId,
          kind: "uniswap-v3-full-range-lp",
          adapterId: "uniswap-v3@1",
          pool: "0x6666666666666666666666666666666666666666",
          token0: output,
          token1: input,
          feeTier: 100,
          tickLower: -887272,
          tickUpper: 887272,
          historicalFeeApyBps: 420,
          tvlUsdE6: "500000000000",
          lookbackSeconds: 86_400,
          validatedInputAsset: input,
          validatedInputAtomic: "15000000",
          balanceSwapInputAtomic: "7500000",
          quotedSwapOutputAtomic: "7490000",
          amount0DesiredAtomic: "7490000",
          amount1DesiredAtomic: "7500000",
          quotedLiquidity: "7490000",
          minimumLiquidity: "7415100",
        }],
      },
      bundle: {
        ...fixture.bundle,
        routePlan: {
          ...fixture.bundle.routePlan,
          legs: [{
            id: "retail-lp",
            inputAtomic: "15000000",
            actions: [{
              kind: "uniswap-v3-balance-swap",
              opportunityId,
              inputAtomic: "7500000",
              tokenIn: input,
              tokenOut: output,
              quotedOutputAtomic: "7490000",
              minimumOutputAtomic: "7415100",
            }, {
              kind: "uniswap-v3-full-range-mint",
              opportunityId,
              token0: output,
              token1: input,
              feeTier: 100,
              tickLower: -887272,
              tickUpper: 887272,
              amount0DesiredAtomic: "7490000",
              amount1DesiredAtomic: "7500000",
              amount0MinAtomic: "7415100",
              amount1MinAtomic: "7425000",
              quotedLiquidity: "7490000",
              minimumLiquidity: "7415100",
            }],
          }],
        },
      },
      rehearsalRealm: "localhost:3000",
      rehearsal: null,
    } as PurchasedRoute;

    render(<PurchasedRouteView route={route} />);

    expect(screen.getByText(/Balance-swap 7.5 USDt0 for at least 7.4151 USDG/))
      .toBeVisible();
    expect(screen.getByText(/Mint a full-range 7.49 USDG \+ 7.5 USDt0/)).toBeVisible();
    expect(screen.getByText(/Historical fee sample 4.20% annualized over 24h; not guaranteed/))
      .toBeVisible();
  });
});
