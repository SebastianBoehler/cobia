import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MarketDetailView } from "@/components/markets/MarketDetailView";
import styles from "@/components/product/ProductShell.module.css";
import { getMarketRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MarketPage(context: PageProps<"/markets/[marketId]">) {
  const { marketId } = await context.params;
  const market = await getMarketRepository().getMarket(marketId, currentUnixSeconds());
  if (!market) notFound();
  return <><AppHeader /><main className={styles.page}>
    <header className={styles.heading}><h1>Competition</h1><p>{market.status === "current" ? "A currently valid reference round." : "A historical round. Start a fresh custom quote before acting."}</p></header>
    <MarketDetailView market={market} />
  </main></>;
}
