import type { Address } from "viem";
import type { OkxPortfolioAnalyticsClient } from "../okx/portfolio-analytics";

type TotalValue = Awaited<ReturnType<OkxPortfolioAnalyticsClient["getXLayerTotalValue"]>>;
type RecentPnl = Awaited<ReturnType<OkxPortfolioAnalyticsClient["getXLayerRecentPnl"]>>;
type DexHistory = Awaited<ReturnType<OkxPortfolioAnalyticsClient["getXLayerDexHistory"]>>;

type Available<T> = { status: "available" } & T;
type Unavailable = { status: "unavailable"; message: string };

export type IndexedPortfolioAnalytics = {
  status: "available";
  source: "okx-indexed";
  totalValue: Available<TotalValue> | Unavailable;
  recentPnl: Available<{ items: RecentPnl }> | Unavailable;
  dexHistory: Available<{ beginAt: string; endAt: string; items: DexHistory["transactions"] }> |
    Unavailable;
} | {
  status: "not_applicable";
  source: "okx-indexed";
  message: string;
};

function unavailable(message: string): Unavailable {
  return { status: "unavailable", message };
}

export async function readIndexedPortfolioAnalytics(
  client: OkxPortfolioAnalyticsClient,
  address: Address,
): Promise<IndexedPortfolioAnalytics> {
  const [total, pnl, history] = await Promise.allSettled([
    client.getXLayerTotalValue(address),
    client.getXLayerRecentPnl(address, 8),
    client.getXLayerDexHistory(address, { days: 30, limit: 8 }),
  ]);

  return {
    status: "available",
    source: "okx-indexed",
    totalValue: total.status === "fulfilled"
      ? { status: "available", ...total.value }
      : unavailable("Indexed portfolio value is temporarily unavailable."),
    recentPnl: pnl.status === "fulfilled"
      ? { status: "available", items: pnl.value }
      : unavailable("Recent indexed PnL is temporarily unavailable."),
    dexHistory: history.status === "fulfilled"
      ? { status: "available", beginAt: history.value.beginAt, endAt: history.value.endAt,
        items: history.value.transactions }
      : unavailable("Recent indexed DEX activity is temporarily unavailable."),
  };
}
