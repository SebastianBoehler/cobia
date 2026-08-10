"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { supportedAsset } from "../../lib/chain/supported-assets";
import type { StoredMarket } from "../../lib/db/markets";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";

export function MarketDetailView({ market }: { market: StoredMarket }) {
  const wallet = useWallet();
  const asset = supportedAsset(market.policy.asset);
  const reference = Number(formatUnits(BigInt(market.policy.principalAtomic), asset.decimals));
  const [result, setResult] = useState<{ account: string; balance: number }>();

  useEffect(() => {
    if (!wallet.account) return;
    let active = true;
    const account = wallet.account;
    fetch(`/api/wallets/${wallet.account}/portfolio?chainId=196`, { cache: "no-store" })
      .then((response) => response.json() as Promise<PortfolioSnapshot>)
      .then((snapshot) => snapshot.balances.find((item) => item.address.toLowerCase() === market.policy.asset.toLowerCase()))
      .then((item) => { if (active) setResult({ account, balance: Number(item?.formatted ?? 0) }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [market.policy.asset, wallet.account]);

  const balance = result?.account === wallet.account ? result.balance : undefined;
  const amount = balance ?? reference;
  return <section className={styles.panel}>
    <div className={styles.panelHeader}><div><h2>Verified solver quotes</h2><p>{balance === undefined ? "Reference amount" : "Your available balance"}: {amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {asset.displaySymbol}</p></div><span className={styles.badge}>{market.status}</span></div>
    <div className={styles.rows}>{market.quotes.map((quote) => {
      const yearly = amount * quote.expectedNetApyBps / 10_000;
      return <div className={styles.row} key={quote.quoteId}><div><strong>{quote.solverId}</strong><small>{quote.riskGrade} risk · {yearly.toLocaleString("en-US", { maximumFractionDigits: 2 })} {asset.displaySymbol}/year</small></div><span>Commitment {quote.bundleHash.slice(0, 12)}…</span><strong>{(quote.expectedNetApyBps / 100).toFixed(2)}%</strong></div>;
    })}</div>
    <Link className="button button--primary" href={`/requests/${market.requestId}`}>Open full competition</Link>
  </section>;
}
