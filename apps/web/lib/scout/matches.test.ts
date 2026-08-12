import { describe, expect, it } from "vitest";
import type { StoredMarketSummary } from "../db/markets";
import { findScoutMatches } from "./matches";

const asset = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const;
const attempt = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  policy: { asset },
  quotes: [{
    version: 2,
    quoteId: `0x${"ab".repeat(32)}`,
    estimatedPreGasApyBps: 240,
  }],
} as unknown as StoredMarketSummary["mostRecentAttempt"];
const market = {
  id: `196:${asset}`,
  executionChainId: 196,
  asset,
  requestAttemptCount: 1,
  quoteBearingAttemptCount: 1,
  latestActiveAttempt: attempt,
  mostRecentAttempt: attempt,
} satisfies StoredMarketSummary;

describe("wallet Scout matches", () => {
  it("returns live routes whose input token is funded and clears the APY floor", () => {
    const matches = findScoutMatches(
      [market],
      new Map([[asset, 10]]),
      { minApyBps: 200 },
    );

    expect(matches).toEqual([expect.objectContaining({
      marketId: market.id,
      requestId: attempt.requestId,
      quoteId: attempt.quotes[0]!.quoteId,
      balance: 10,
      apyBps: 240,
    })]);
  });

  it("rejects unfunded, below-floor, and historical routes", () => {
    expect(findScoutMatches([market], new Map(), { minApyBps: 0 })).toEqual([]);
    expect(findScoutMatches([market], new Map([[asset, 10]]), { minApyBps: 241 })).toEqual([]);
    expect(findScoutMatches(
      [{ ...market, latestActiveAttempt: null }],
      new Map([[asset, 10]]),
      { minApyBps: 0 },
    )).toEqual([]);
  });
});
