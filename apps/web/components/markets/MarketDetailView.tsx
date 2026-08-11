"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { supportedAsset } from "../../lib/chain/supported-assets";
import type { MarketAttempt, StoredMarketDetail } from "../../lib/db/markets";
import { riskGradeLabel } from "../../lib/markets/risk-grade";
import {
  protocolSourceLabel,
  quoteApyBps,
  quoteApyLabel,
} from "../../lib/markets/quote-metrics";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";

function attemptLabel(attempt: MarketAttempt): string {
  if (attempt.lifecycle === "running") return "Running";
  if (attempt.lifecycle === "failed") return "Failed";
  return attempt.quoteEligibility === "active" ? "Current" : "Completed";
}

export function MarketDetailView({ market }: { market: StoredMarketDetail }) {
  const wallet = useWallet();
  const primary = market.latestActiveAttempt ?? market.mostRecentAttempt;
  const active = market.latestActiveAttempt !== null;
  const asset = supportedAsset(market.asset);
  const reference = Number(formatUnits(BigInt(primary.policy.principalAtomic), asset.decimals));
  const [result, setResult] = useState<{ account: string; balance: number }>();

  useEffect(() => {
    if (!wallet.account) return;
    let mounted = true;
    const account = wallet.account;
    fetch(`/api/wallets/${account}/portfolio?chainId=196`, { cache: "no-store" })
      .then((response) => response.json() as Promise<PortfolioSnapshot>)
      .then((snapshot) => snapshot.balances.find(
        (item) => item.address.toLowerCase() === market.asset.toLowerCase(),
      ))
      .then((item) => { if (mounted) setResult({ account, balance: Number(item?.formatted ?? 0) }); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [market.asset, wallet.account]);

  const balance = result?.account === wallet.account ? result.balance : undefined;
  const amount = balance ?? reference;
  const heading = active
    ? "Current eligible quote"
    : primary.lifecycle === "running" ? "Request attempt running" : "Most recent request attempt";
  const history = market.attempts.filter(({ requestId }) => requestId !== primary.requestId);
  return <section className={styles.panel}>
    <div className={styles.panelHeader}><div><h2>{heading}</h2><p>{balance === undefined ? "Reference amount" : "Your available balance"}: {amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {asset.displaySymbol} · {market.requestAttemptCount} request attempt{market.requestAttemptCount === 1 ? "" : "s"} · {market.quoteBearingAttemptCount} with quotes</p></div><span className={styles.badge}>{attemptLabel(primary)}</span></div>
    {primary.policy.version === 2 ? <p>{protocolSourceLabel(
      primary.policy,
      primary.protocols,
      primary.sourceApyBps,
    )}</p> : null}
    <div className={styles.rows}>{primary.quotes.map((quote) => {
      const apyBps = quoteApyBps(quote);
      const yearly = amount * apyBps / 10_000;
      return <div className={styles.row} key={quote.quoteId}><div><strong>{quote.solverId}</strong><small>Risk: {riskGradeLabel(quote.riskGrade)} · {quoteApyLabel(quote)} · {yearly.toLocaleString("en-US", { maximumFractionDigits: 2 })} {asset.displaySymbol}/year</small></div><span>Commitment {quote.bundleHash.slice(0, 12)}…</span><strong>{(apyBps / 100).toFixed(2)}%</strong></div>;
    })}</div>
    {active ? <Link className="button button--primary" href={`/requests/${primary.requestId}`}>Review active quote</Link> : primary.lifecycle === "running" ? <Link className="button button--primary" href={`/requests/${primary.requestId}`}>View request status</Link> : <Link className="button button--quiet" href={`/requests/${primary.requestId}`}>Review request attempt</Link>}
    <h3>Recent request attempts</h3>
    <div className={styles.rows}>{history.map((attempt) => <div className={styles.row} key={attempt.requestId}><div><strong>{attemptLabel(attempt)}</strong><small>{attempt.quotes.length ? attempt.quotes.map(({ solverId }) => solverId).join(", ") : attempt.policy.version === 1 ? "No verifier-executable quotes" : "No authorized route quotes"}</small></div><Link href={`/requests/${attempt.requestId}`}>View request</Link></div>)}</div>
    {market.nextCursor ? <p>More request history is available through the market API.</p> : null}
  </section>;
}
