// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { StablecoinPolicyV2Schema } from "@cobia/domain";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRepositoryFixtureV2 } from "../../lib/db/repository-test-fixtures";
import { PurchasedRouteView, type PurchasedRoute } from "./PurchasedRouteView";

describe("PurchasedRouteView V2", () => {
  it("renders retained capital and ordered adapter actions as a non-executing plan", async () => {
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
      "Risk buffer selected in the signed intent",
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
});
