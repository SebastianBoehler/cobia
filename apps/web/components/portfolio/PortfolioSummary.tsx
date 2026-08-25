import { Layers3, Landmark, WalletCards } from "lucide-react";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { formatTimestamp, formatUsd } from "./format";
import styles from "./PortfolioView.module.css";

export function PortfolioSummary({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const analytics = snapshot.analytics;
  const total = analytics?.status === "available" ? analytics.totalValue : undefined;
  const activity = analytics?.status === "available" && analytics.dexHistory.status === "available"
    ? analytics.dexHistory.items.length : 0;

  return <section className={styles.summary} aria-label="Portfolio value">
    <div className={styles.valueBlock}>
      {total?.status === "available"
        ? <><strong className={styles.portfolioValue}>{formatUsd(total.totalValueUsd)}</strong>
          <p className={styles.sourceLine}><time dateTime={total.fetchedAt}>
            {formatTimestamp(total.fetchedAt)}</time></p></>
        : <><strong className={styles.portfolioValueMuted}>Value unavailable</strong>
          <p className={styles.sourceError}>{total?.message ??
            "Indexed portfolio value was not returned by this Cobia host."}</p></>}
    </div>
    <dl className={styles.summaryFacts}>
      <div><dt><WalletCards aria-hidden="true" size={16} />Wallet assets</dt>
        <dd>{snapshot.balances.length + 1}</dd></div>
      <div><dt><Landmark aria-hidden="true" size={16} />Protocol positions</dt>
        <dd>{snapshot.positions.length}</dd></div>
      <div><dt><Layers3 aria-hidden="true" size={16} />Recent DEX trades</dt>
        <dd>{activity}</dd></div>
    </dl>
  </section>;
}
