"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoredMarket } from "../../lib/db/markets";
import {
  balanceForAsset,
  balancesFromPortfolio,
  latestMarketsByAsset,
  rankMarkets,
} from "../../lib/markets/personalization";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";
import { MarketCard } from "./MarketCard";

export function MarketsView({ markets }: { markets: StoredMarket[] }) {
  const wallet = useWallet();
  const [result, setResult] = useState<{ account: string; snapshot: PortfolioSnapshot }>();

  useEffect(() => {
    if (!wallet.account) return;
    let active = true;
    const account = wallet.account;
    fetch(`/api/wallets/${wallet.account}/portfolio?chainId=196`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Portfolio unavailable");
        return response.json() as Promise<PortfolioSnapshot>;
      })
      .then((snapshot) => { if (active) setResult({ account, snapshot }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [wallet.account]);

  const portfolio = result?.account === wallet.account ? result.snapshot : undefined;
  const balances = useMemo(() => balancesFromPortfolio(portfolio), [portfolio]);
  const ordered = useMemo(() => rankMarkets(markets, balances), [balances, markets]);
  const groups = useMemo(() => latestMarketsByAsset(ordered), [ordered]);

  return <>
    {wallet.account ? <p className={styles.walletContext}>
      Ranked for your X Layer mainnet balances. Markets matching assets you already hold appear first.
    </p> : null}
    <section className={styles.grid}>{groups.map(({ market, roundCount }) => <MarketCard
      key={`${market.policy.executionChainId}:${market.policy.asset}`}
      market={market}
      roundCount={roundCount}
      walletBalance={portfolio ? balanceForAsset(balances, market.policy.asset) : undefined}
    />)}</section>
  </>;
}
