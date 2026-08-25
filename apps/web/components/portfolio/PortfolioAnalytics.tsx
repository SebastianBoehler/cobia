import { ArrowDownLeft, ArrowUpRight, Database } from "lucide-react";
import type { IndexedPortfolioAnalytics } from "../../lib/portfolio/read-indexed-analytics";
import { formatAmount, formatCount, formatSignedPercent, formatSignedUsd, formatTimestamp,
  formatUsd } from "./format";
import styles from "./PortfolioView.module.css";

function SourceLabel({ detail }: { detail: string }) {
  return <p className={styles.sectionSource}><Database aria-hidden="true" size={14} />
    OKX-indexed <span>· {detail}</span></p>;
}

function pnlTone(value: string): string {
  const parsed = Number(value);
  return parsed > 0 ? styles.positive : parsed < 0 ? styles.negative : styles.neutral;
}

export function PortfolioAnalytics({ analytics }: { analytics?: IndexedPortfolioAnalytics }) {
  if (!analytics || analytics.status === "not_applicable") return null;
  const pnl = analytics.recentPnl;
  const history = analytics.dexHistory;

  return <div className={styles.analyticsLayout}>
    <section className={styles.section} aria-labelledby="portfolio-pnl-title">
      <header className={styles.sectionHeader}><div><h2 id="portfolio-pnl-title">PnL by asset</h2>
        <SourceLabel detail="realized and open positions" /></div>
        {pnl.status === "available" ? <span>{formatCount(pnl.items.length, "asset")}</span> : null}</header>
      {pnl.status === "unavailable" ? <p className={styles.inlineError} role="status">{pnl.message}</p>
        : pnl.items.length === 0 ? <div className={styles.inlineEmpty}><strong>No indexed PnL yet</strong>
          <p>PnL appears after OKX indexes trading activity for this address.</p></div>
          : <ul className={styles.dataRows}>{pnl.items.map((item) => <li className={styles.pnlRow}
            key={`${item.token}-${item.lastActiveAt}`}>
            <div><strong>{item.symbol}</strong><small>{formatUsd(item.balanceUsd)} position</small></div>
            <div><span className={pnlTone(item.totalPnlUsd)}>{formatSignedUsd(item.totalPnlUsd)}</span>
              <small>{formatSignedPercent(item.totalPnlPercent)} total</small></div>
            <time dateTime={item.lastActiveAt}>{formatTimestamp(item.lastActiveAt)}</time>
          </li>)}</ul>}
    </section>
    <section className={styles.section} aria-labelledby="dex-activity-title">
      <header className={styles.sectionHeader}><div><h2 id="dex-activity-title">Recent DEX activity</h2>
        <SourceLabel detail="last 30 days" /></div>
        {history.status === "available" ? <span>{formatCount(history.items.length, "trade")}</span> : null}</header>
      {history.status === "unavailable" ? <p className={styles.inlineError} role="status">{history.message}</p>
        : history.items.length === 0 ? <div className={styles.inlineEmpty}><strong>No recent DEX trades</strong>
          <p>Buy and sell activity will appear after it is indexed.</p></div>
          : <ul className={styles.dataRows}>{history.items.map((item, index) => <li
            className={styles.tradeRow} key={`${item.token}-${item.occurredAt}-${index}`}>
            <span className={styles.tradeIcon} data-type={item.type}>{item.type === "buy"
              ? <ArrowDownLeft aria-hidden="true" size={17} />
              : <ArrowUpRight aria-hidden="true" size={17} />}</span>
            <div><strong>{item.type === "buy" ? "Buy" : "Sell"} {item.symbol}</strong>
              <small>{formatAmount(item.amount)} {item.symbol} at {formatUsd(item.priceUsd)}</small></div>
            <div className={styles.tradeValue}><strong>{formatUsd(item.valueUsd)}</strong>
              <small className={pnlTone(item.pnlUsd)}>{formatSignedUsd(item.pnlUsd)} PnL</small></div>
            <time dateTime={item.occurredAt}>{formatTimestamp(item.occurredAt)}</time>
          </li>)}</ul>}
    </section>
  </div>;
}
