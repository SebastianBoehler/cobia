import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MarketDetailView } from "@/components/markets/MarketDetailView";
import styles from "@/components/product/ProductShell.module.css";
import { getMarketRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import type { Metadata } from "next";
import { createPageMetadata } from "../../site-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  context: PageProps<"/markets/[marketId]">,
): Promise<Metadata> {
  const { marketId } = await context.params;
  return createPageMetadata({
    title: "Verified Solver Market",
    description: "Inspect the public history, active quote, route proof, and bounded outcome for this X Layer solver market.",
    path: `/markets/${marketId}`,
  });
}

export default async function MarketPage(context: PageProps<"/markets/[marketId]">) {
  const { marketId } = await context.params;
  const resolution = await getMarketRepository().resolveMarket(marketId, currentUnixSeconds());
  if (!resolution) notFound();
  if (resolution.resolvedFrom === "attempt") redirect(`/markets/${resolution.canonicalId}`);
  const { market } = resolution;
  const description = market.latestActiveAttempt
    ? "A current snapshot-derived estimate."
    : market.mostRecentAttempt.lifecycle === "running"
      ? "The latest request attempt is still running."
      : "No current quote is available. Create a fresh request before relying on historical output.";
  return <><AppHeader /><main className={styles.page} id="main-content">
    <header className={styles.heading}><h1>Solver route</h1><p>{description} Purchased V2 routes can be rehearsed on a fork and executed on X Layer with explicit wallet confirmation.</p></header>
    <MarketDetailView market={market} />
  </main></>;
}
