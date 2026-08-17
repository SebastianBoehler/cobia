import { AppHeader } from "@/components/layout/AppHeader";
import { MarketsView } from "@/components/markets/MarketsView";
import styles from "@/components/product/ProductShell.module.css";
import { getMarketRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import Link from "next/link";
import { createPageMetadata } from "../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Verified Route Markets",
  description: "Explore active and historical X Layer solver markets with public route proofs and clearly separated estimates.",
  path: "/markets",
});

export default async function MarketsPage() {
  const markets = await getMarketRepository().listMarkets(currentUnixSeconds());
  return <><AppHeader /><main className={styles.page} id="main-content">
    <header className={styles.heading}><h1>Route markets</h1><p>Explore live solver results and past discoveries on X Layer. A past discovery is research history only: it cannot be selected or executed, and using the idea requires a fresh wallet-specific intent and verification.</p></header>
    {markets.length ? <MarketsView markets={markets} /> : (
      <section className={styles.empty}><h2>No solver markets yet</h2><p>Create an intent to run solvers against a fresh X Layer snapshot. The resulting market will remain discoverable after its quote expires.</p><Link className="button button--primary" href="/requests/new">Create an intent</Link></section>
    )}
  </main></>;
}
