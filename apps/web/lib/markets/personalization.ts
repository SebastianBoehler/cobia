import type { Address } from "viem";
import type { StoredMarket } from "../db/markets";
import type { PortfolioSnapshot } from "../portfolio/read-portfolio";

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

export function rankMarkets(markets: StoredMarket[], balances: AssetBalances): StoredMarket[] {
  return [...markets].sort((left, right) => {
    const leftFunded = balanceForAsset(balances, left.policy.asset) > 0 ? 1 : 0;
    const rightFunded = balanceForAsset(balances, right.policy.asset) > 0 ? 1 : 0;
    if (leftFunded !== rightFunded) return rightFunded - leftFunded;
    if (left.status !== right.status) return left.status === "current" ? -1 : 1;
    const leftApy = Math.max(...left.quotes.map((quote) => quote.expectedNetApyBps));
    const rightApy = Math.max(...right.quotes.map((quote) => quote.expectedNetApyBps));
    return rightApy - leftApy;
  });
}

export interface MarketGroup {
  market: StoredMarket;
  roundCount: number;
}

export function latestMarketsByAsset(markets: StoredMarket[]): MarketGroup[] {
  const groups = new Map<string, MarketGroup>();
  for (const market of markets) {
    const key = `${market.policy.executionChainId}:${market.policy.asset.toLowerCase()}`;
    const current = groups.get(key);
    if (current) {
      current.roundCount += 1;
      if (current.market.status === "historical" && market.status === "current") current.market = market;
    } else {
      groups.set(key, { market, roundCount: 1 });
    }
  }
  return [...groups.values()];
}
