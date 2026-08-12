import { describe, expect, it } from "vitest";
import type { MarketAttempt, StoredMarketSummary } from "../db/markets";
import { rankMarkets } from "./personalization";

const assetA = "0x1111111111111111111111111111111111111111";
const assetB = "0x2222222222222222222222222222222222222222";

function market(id: string, asset: `0x${string}`, apy: number): StoredMarketSummary {
  const round = {
    policy: { asset } as MarketAttempt["policy"],
    quotes: [{ expectedNetApyBps: apy } as MarketAttempt["quotes"][number]],
    quoteEligibility: "active",
  } as MarketAttempt;
  return {
    id,
    executionChainId: 196,
    asset,
    latestActiveAttempt: round,
    mostRecentAttempt: round,
    requestAttemptCount: 1,
    quoteBearingAttemptCount: 1,
  };
}

function routeQuote(apy: number): Extract<
  MarketAttempt["quotes"][number],
  { version: 2 }
> {
  return {
    version: 2,
    quoteId: `0x${"ab".repeat(32)}`,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    solverId: "route-solver",
    solverAddress: "0x1111111111111111111111111111111111111111",
    bundleHash: `0x${"ab".repeat(32)}`,
    estimatedPreGasApyBps: apy,
    riskGrade: "unassessed",
    priceAtomic: "100000",
    validUntil: 2_000_000_000,
    authorization: { routeAuthorized: true, errorCodes: [] },
  };
}

describe("market personalization", () => {
  it("ranks markets supported by a held asset before a higher unsupported APY", () => {
    const funded = market("funded", assetA, 100);
    const unsupported = market("unsupported", assetB, 900);
    expect(rankMarkets([unsupported, funded], new Map([[assetA, 25]]))[0]?.id).toBe("funded");
  });

  it("ranks V2 markets by estimated pre-gas APY", () => {
    const lower = market("lower", assetA, 100);
    const higher = market("higher", assetB, 900);
    lower.latestActiveAttempt!.quotes = [routeQuote(100)];
    higher.latestActiveAttempt!.quotes = [routeQuote(900)];

    expect(rankMarkets([lower, higher], new Map())[0]?.id).toBe("higher");
  });

  it("ranks a live route before a funded historical market", () => {
    const historical = market("historical", assetA, 900);
    historical.latestActiveAttempt = null;
    historical.mostRecentAttempt.quoteEligibility = "inactive";
    const live = market("live", assetB, 100);

    expect(rankMarkets([historical, live], new Map([[assetA, 25]]))[0]?.id)
      .toBe("live");
  });
});
