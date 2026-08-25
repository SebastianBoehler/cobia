"use client";

import { CircleAlert, LoaderCircle, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { useWallet } from "../wallet/WalletProvider";
import { WalletButton } from "../wallet/WalletButton";
import shellStyles from "../product/ProductShell.module.css";
import { PortfolioAnalytics } from "./PortfolioAnalytics";
import { PortfolioHoldings } from "./PortfolioHoldings";
import { PortfolioSummary } from "./PortfolioSummary";
import styles from "./PortfolioView.module.css";

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
    fetch(`/api/wallets/${wallet.account}/portfolio?chainId=${wallet.targetChainId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Portfolio read failed.");
        return body as PortfolioSnapshot;
      })
      .then((body) => { if (active) setResult({ account, snapshot: body }); })
      .catch((cause) => { if (active) setResult({ account, error: cause instanceof Error ? cause.message : "Portfolio read failed." }); });
    return () => { active = false; };
  }, [wallet.account, wallet.chainId, wallet.targetChainId]);

  const testnet = wallet.targetChainId === 1952;
  if (!wallet.account) return <section className={shellStyles.empty}><WalletCards size={28} /><h2>Connect your wallet</h2><p>{testnet ? "Read your testnet OKB balance directly from chain 1952." : "See your X Layer balances, positions, PnL, and recent DEX activity."}</p><WalletButton placement="empty-state" /></section>;
  if (result?.account !== wallet.account) return <section className={shellStyles.empty} role="status"><LoaderCircle className="spin" /><h2>Reading {testnet ? "X Layer Testnet" : "X Layer portfolio"}</h2></section>;
  if (result.error) return <section className={shellStyles.empty} role="alert"><CircleAlert /><h2>Portfolio unavailable</h2><p className={shellStyles.error}>{result.error} Check your connection and try again.</p></section>;
  const snapshot = result.snapshot;
  if (!snapshot) return null;
  return <section className={styles.workspace} aria-label="Portfolio workspace">
    <header className={styles.workspaceHeader}><div><strong>On-chain statement</strong>
      <p>Balances are pinned to block {snapshot.blockNumber}; analytics are indexed separately.</p></div>
      <span className={styles.network}>{snapshot.networkName}</span></header>
    {snapshot.chainId === 196 ? <PortfolioSummary snapshot={snapshot} /> : null}
    <PortfolioHoldings snapshot={snapshot} />
    {snapshot.chainId === 196 ? <PortfolioAnalytics analytics={snapshot.analytics} /> : null}
  </section>;
}
