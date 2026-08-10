import { AppHeader } from "@/components/layout/AppHeader";
import { MarketsView } from "@/components/markets/MarketsView";
import styles from "@/components/product/ProductShell.module.css";
import { getMarketRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const markets = await getMarketRepository().listMarkets(currentUnixSeconds());
  return <><AppHeader /><main className={styles.page}>
    <header className={styles.heading}><h1>Earn markets</h1><p>Solver competitions over routes that Cobia can verify. Historical rounds stay visible but can never be executed as fresh quotes.</p></header>
    {markets.length ? <MarketsView markets={markets} /> : (
      <section className={styles.empty}><h2>No verified rounds yet</h2><p>Cobia does not fabricate yield cards. Create a custom request to produce the first stored competition.</p></section>
    )}
  </main></>;
}
