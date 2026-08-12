import type { StoredMarketSummary } from "../db/markets";
import type { AssetBalances } from "../markets/personalization";
import { balanceForAsset } from "../markets/personalization";
import { quoteApyBps } from "../markets/quote-metrics";

export interface ScoutPreferences {
  minApyBps: number;
}

export interface ScoutMatch {
  marketId: string;
  requestId: string;
  quoteId: string;
  asset: `0x${string}`;
  balance: number;
  apyBps: number;
}

export function findScoutMatches(
  markets: readonly StoredMarketSummary[],
  balances: AssetBalances,
  preferences: ScoutPreferences,
): ScoutMatch[] {
  if (!Number.isSafeInteger(preferences.minApyBps) || preferences.minApyBps < 0) {
    throw new Error("Scout APY floor is invalid");
  }
  return markets.flatMap((market) => {
    const attempt = market.latestActiveAttempt;
    const balance = balanceForAsset(balances, market.asset);
    if (!attempt || balance <= 0) return [];
    const quote = [...attempt.quotes]
      .sort((left, right) => quoteApyBps(right) - quoteApyBps(left))[0];
    if (!quote) return [];
    const apyBps = quoteApyBps(quote);
    return apyBps >= preferences.minApyBps ? [{
      marketId: market.id,
      requestId: attempt.requestId,
      quoteId: quote.quoteId,
      asset: market.asset,
      balance,
      apyBps,
    }] : [];
  }).sort((left, right) => right.apyBps - left.apyBps);
}
