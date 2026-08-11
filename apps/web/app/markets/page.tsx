import { AppHeader } from "@/components/layout/AppHeader";
import { MarketsView } from "@/components/markets/MarketsView";
import styles from "@/components/product/ProductShell.module.css";
import { getMarketRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const markets = await getMarketRepository().listMarkets(currentUnixSeconds());
  return <><AppHeader /><main className={styles.page}>
    <header className={styles.heading}><h1>Allocation quotes</h1><p>Current eligible allocation quotes from snapshot-derived Aave V3 and Uniswap V3 opportunities. Yield semantics are labeled per quote; eligibility expires with each quote.</p></header>
    {markets.length ? <MarketsView markets={markets} /> : (
      <section className={styles.empty}><h2>No active quotes</h2><p>No stored quote is currently eligible. Create a request to produce a fresh deterministic allocation quote.</p></section>
    )}
  </main></>;
}
