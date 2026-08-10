import Link from "next/link";
import { formatUnits } from "viem";
import { supportedAsset } from "../../lib/chain/supported-assets";
import type { StoredMarket } from "../../lib/db/markets";
import styles from "../product/ProductShell.module.css";

export function MarketCard({ market, walletBalance, roundCount = 1 }: {
  market: StoredMarket;
  walletBalance?: number;
  roundCount?: number;
}) {
  const asset = supportedAsset(market.policy.asset);
  const leader = [...market.quotes].sort((a, b) => b.expectedNetApyBps - a.expectedNetApyBps)[0];
  const principal = Number(formatUnits(BigInt(market.policy.principalAtomic), asset.decimals));
  const estimatePrincipal = walletBalance ?? principal;
  const yearly = estimatePrincipal * leader.expectedNetApyBps / 10_000;
  const monthly = yearly / 12;
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div><h2>{asset.displaySymbol} Earn</h2><p>X Layer · {roundCount} verified round{roundCount === 1 ? "" : "s"}</p></div>
        <span className={`${styles.badge} ${market.status === "historical" ? styles.historical : ""}`}>{market.status}</span>
      </div>
      <div className={styles.metric}>
        <strong>{(leader.expectedNetApyBps / 100).toFixed(2)}%</strong>
        <span>verified net APY · about {yearly.toLocaleString("en-US", { maximumFractionDigits: 2 })} {asset.displaySymbol}/year · {monthly.toLocaleString("en-US", { maximumFractionDigits: 2 })}/month</span>
      </div>
      <div className={styles.facts}>
        <span>{walletBalance === undefined ? "Reference amount" : "Available in your wallet"} {estimatePrincipal.toLocaleString("en-US", { maximumFractionDigits: 6 })} {asset.displaySymbol}</span>
        <span>{market.protocols?.join(", ") || "No protocol allocation"} source rate {((market.sourceApyBps ?? 0) / 100).toFixed(2)}% · {(market.policy.maxProtocolExposureBps / 100).toFixed(0)}% maximum exposure</span>
        <span>{market.blockNumber ? `Verified at block ${market.blockNumber}` : "Historical snapshot block unavailable"}</span>
        <span>Risk grade {leader.riskGrade}</span>
      </div>
      <Link className={`button button--quiet ${styles.buttonLink}`} href={`/markets/${market.id}`}>View competition</Link>
    </article>
  );
}
