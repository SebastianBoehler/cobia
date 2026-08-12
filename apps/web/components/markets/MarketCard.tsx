import Link from "next/link";
import { formatUnits } from "viem";
import { supportedAsset } from "../../lib/chain/supported-assets";
import type { StoredMarketSummary } from "../../lib/db/markets";
import { riskGradeLabel } from "../../lib/markets/risk-grade";
import {
  exposureLabel,
  protocolSourceLabel,
  quoteApyBps,
  quoteApyLabel,
} from "../../lib/markets/quote-metrics";
import styles from "../product/ProductShell.module.css";

export function MarketCard({ market, walletBalance }: {
  market: StoredMarketSummary;
  walletBalance?: number;
}) {
  const live = market.latestActiveAttempt !== null;
  const attempt = market.latestActiveAttempt ?? market.mostRecentAttempt;
  const asset = supportedAsset(market.asset);
  const leader = [...attempt.quotes].sort((a, b) => quoteApyBps(b) - quoteApyBps(a))[0];
  if (!leader) return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div><h2>{asset.displaySymbol} solver market</h2><p>X Layer · {market.requestAttemptCount} request attempt{market.requestAttemptCount === 1 ? "" : "s"} · {market.quoteBearingAttemptCount} with quotes</p></div>
        <span className={`${styles.badge} ${styles.historical}`}>
          {attempt.lifecycle === "running" ? "solving" : attempt.lifecycle}
        </span>
      </div>
      <div className={styles.metric}>
        <strong>{attempt.lifecycle === "running" ? "In progress" : "No route"}</strong>
        <span>{attempt.lifecycle === "running"
          ? "Solvers are evaluating a pinned X Layer snapshot."
          : "No authorized route was published for the latest request."}</span>
      </div>
      <Link className={`button button--quiet ${styles.buttonLink}`} href={`/markets/${market.id}`}>
        View market
      </Link>
    </article>
  );
  const apyBps = quoteApyBps(leader);
  const principal = Number(formatUnits(BigInt(attempt.policy.principalAtomic), asset.decimals));
  const estimatePrincipal = live ? walletBalance ?? principal : principal;
  const yearly = estimatePrincipal * apyBps / 10_000;
  const monthly = yearly / 12;
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div><h2>{asset.displaySymbol} route market</h2><p>X Layer · {market.requestAttemptCount} request attempt{market.requestAttemptCount === 1 ? "" : "s"} · {market.quoteBearingAttemptCount} with quotes</p></div>
        <span className={`${styles.badge} ${live ? "" : styles.historical}`}>
          {live ? "live" : "historical"}
        </span>
      </div>
      <div className={styles.metric}>
        <strong>{(apyBps / 100).toFixed(2)}%</strong>
        <span>{live ? quoteApyLabel(leader) : `Last authorized estimate · ${quoteApyLabel(leader)}`} · about {yearly.toLocaleString("en-US", { maximumFractionDigits: 2 })} {asset.displaySymbol}/year · {monthly.toLocaleString("en-US", { maximumFractionDigits: 2 })}/month</span>
      </div>
      <div className={styles.facts}>
        <span>{live && walletBalance !== undefined ? "Available in your wallet" : "Reference amount"} {estimatePrincipal.toLocaleString("en-US", { maximumFractionDigits: 6 })} {asset.displaySymbol}</span>
        <span>{protocolSourceLabel(attempt.policy, attempt.protocols, attempt.sourceApyBps)} · {exposureLabel(attempt.policy)}</span>
        <span>{attempt.blockNumber ? `Snapshot reference block ${attempt.blockNumber}` : "Snapshot block unavailable"}</span>
        <span>Risk grade {riskGradeLabel(leader.riskGrade)}</span>
      </div>
      <Link className={`button button--quiet ${styles.buttonLink}`} href={`/markets/${market.id}`}>
        {live ? "View quote" : "Review route history"}
      </Link>
    </article>
  );
}
