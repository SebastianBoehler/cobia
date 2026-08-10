"use client";

import { CircleAlert, LoaderCircle, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";

function pretty(value: string): string {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function PortfolioView() {
  const wallet = useWallet();
  const [result, setResult] = useState<{
    account: string;
    snapshot?: PortfolioSnapshot;
    error?: string;
  }>();

  useEffect(() => {
    if (!wallet.account) return;
    let active = true;
    const account = wallet.account;
    const chainId = wallet.chainId === 1952 ? 1952 : 196;
    fetch(`/api/wallets/${wallet.account}/portfolio?chainId=${chainId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Portfolio read failed.");
        return body as PortfolioSnapshot;
      })
      .then((body) => { if (active) setResult({ account, snapshot: body }); })
      .catch((cause) => { if (active) setResult({ account, error: cause instanceof Error ? cause.message : "Portfolio read failed." }); });
    return () => { active = false; };
  }, [wallet.account, wallet.chainId]);

  if (!wallet.account) return <section className={styles.empty}><WalletCards size={28} /><h2>Connect your wallet</h2><p>Your X Layer balances and protocol positions are read directly from chain state.</p></section>;
  if (result?.account !== wallet.account) return <section className={styles.empty}><LoaderCircle className="spin" /><h2>Reading X Layer</h2></section>;
  if (result.error) return <section className={styles.empty}><CircleAlert /><h2>Portfolio unavailable</h2><p className={styles.error}>{result.error}</p></section>;
  const snapshot = result.snapshot;
  if (!snapshot) return null;
  return <section className={styles.panel}>
    <div className={styles.panelHeader}><div><h2>Wallet assets</h2><p>Observed at block {snapshot.blockNumber}</p></div><span className={styles.badge}>{snapshot.networkName}</span></div>
    {snapshot.chainId === 1952 ? <p className={styles.notice}>Testnet assets are for payment and execution rehearsal only. Live earn markets use X Layer mainnet balances.</p> : null}
    <div className={styles.rows}>
      <div className={styles.row}><div><strong>OKB</strong><small>Gas balance</small></div><span>Native asset</span><strong>{pretty(snapshot.native.formatted)}</strong></div>
      {snapshot.balances.map((balance) => <div className={styles.row} key={balance.address}><div><strong>{balance.symbol}</strong><small>Wallet balance</small></div><span>{balance.address.slice(0, 10)}…</span><strong>{pretty(balance.formatted)}</strong></div>)}
      {snapshot.positions.map((position) => <div className={styles.row} key={position.symbol}><div><strong>{position.symbol}</strong><small>Aave V3 supplied position</small></div><span>{position.adapterId}</span><strong>{pretty(position.formatted)}</strong></div>)}
    </div>
  </section>;
}
