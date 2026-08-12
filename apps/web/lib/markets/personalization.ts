import type { Address } from "viem";
import type { StoredMarketSummary } from "../db/markets";
import type { PortfolioSnapshot } from "../portfolio/read-portfolio";
import { quoteApyBps } from "./quote-metrics";

export type AssetBalances = ReadonlyMap<string, number>;

export function balancesFromPortfolio(snapshot?: PortfolioSnapshot): AssetBalances {
  return new Map(snapshot?.balances.map((balance) => [
    balance.address.toLowerCase(),
    Number(balance.formatted),
  ]) ?? []);
}

export function balanceForAsset(balances: AssetBalances, asset: Address): number {
  return balances.get(asset.toLowerCase()) ?? 0;
}

export function rankMarkets(
  markets: StoredMarketSummary[],
  balances: AssetBalances,
): StoredMarketSummary[] {
  return [...markets].sort((left, right) => {
    const leftLive = left.latestActiveAttempt ? 1 : 0;
    const rightLive = right.latestActiveAttempt ? 1 : 0;
    if (leftLive !== rightLive) return rightLive - leftLive;
    const leftFunded = balanceForAsset(balances, left.asset) > 0 ? 1 : 0;
    const rightFunded = balanceForAsset(balances, right.asset) > 0 ? 1 : 0;
    if (leftFunded !== rightFunded) return rightFunded - leftFunded;
    const leftAttempt = left.latestActiveAttempt ?? left.mostRecentAttempt;
    const rightAttempt = right.latestActiveAttempt ?? right.mostRecentAttempt;
    const leftApy = Math.max(...leftAttempt.quotes
      .map(quoteApyBps), 0);
    const rightApy = Math.max(...rightAttempt.quotes
      .map(quoteApyBps), 0);
    return rightApy - leftApy;
  });
}
