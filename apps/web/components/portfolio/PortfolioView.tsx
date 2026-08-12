"use client";

import { CircleAlert, LoaderCircle, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { WalletScout } from "../scout/WalletScout";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";
import { PortfolioAssetMark } from "./PortfolioAssetMark";

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
    fetch(`/api/wallets/${wallet.account}/portfolio?chainId=196`, { cache: "no-store" })
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
  return <section className={`${styles.panel} ${styles.widePanel}`}>
    <div className={styles.panelHeader}><div><h2>Onchain holdings</h2><p>Fresh wallet and protocol state at block {snapshot.blockNumber}</p></div><span className={styles.badge}>{snapshot.networkName}</span></div>
    <section className={styles.holdingGroup} aria-labelledby="wallet-balances-title">
      <div className={styles.groupHeader}><h3 id="wallet-balances-title">Wallet balances</h3><span>{snapshot.balances.length + 1} assets</span></div>
      <div className={styles.holdingGrid}>
        <article className={styles.holdingCard}>
          <div className={styles.holdingIdentity}><PortfolioAssetMark symbol="OKB" /><div><strong>OKB</strong><small>Native gas token</small></div></div>
          <span className={styles.holdingSource}>Wallet</span>
          <strong className={styles.holdingBalance}>{pretty(snapshot.native.formatted)} OKB</strong>
        </article>
        {snapshot.balances.map((balance) => <article className={styles.holdingCard} key={balance.address}>
          <div className={styles.holdingIdentity}><PortfolioAssetMark symbol={balance.symbol} /><div><strong>{balance.symbol}</strong><small>Available to route</small></div></div>
          <span className={styles.holdingSource} title={balance.address}>{balance.address.slice(0, 8)}…{balance.address.slice(-4)}</span>
          <strong className={styles.holdingBalance}>{pretty(balance.formatted)} {balance.symbol}</strong>
        </article>)}
      </div>
    </section>
    <section className={styles.holdingGroup} aria-labelledby="protocol-positions-title">
      <div className={styles.groupHeader}><h3 id="protocol-positions-title">Protocol positions</h3><span>{snapshot.positions.length} Aave V3 positions</span></div>
      <div className={styles.holdingGrid}>
        {snapshot.positions.map((position) => <article className={styles.holdingCard} key={position.symbol}>
          <div className={styles.holdingIdentity}><PortfolioAssetMark symbol={position.symbol} /><div><strong>{position.symbol}</strong><small>Aave V3 supplied balance</small></div></div>
          <span className={styles.holdingSource}>Aave V3</span>
          <strong className={styles.holdingBalance}>{pretty(position.formatted)} {position.symbol}</strong>
        </article>)}
      </div>
    </section>
    <WalletScout account={wallet.account} snapshot={snapshot} />
  </section>;
}
