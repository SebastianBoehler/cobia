"use client";

import { BellRing, Radar } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supportedAsset } from "../../lib/chain/supported-assets";
import type { StoredMarketSummary } from "../../lib/db/markets";
import { balancesFromPortfolio } from "../../lib/markets/personalization";
import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { findScoutMatches, type ScoutMatch } from "../../lib/scout/matches";
import { AssetMark } from "../brand/AssetMark";
import styles from "./WalletScout.module.css";

const scanIntervalMs = 60_000;

export function WalletScout({
  account,
  snapshot,
}: {
  account: string;
  snapshot: PortfolioSnapshot;
}) {
  const storageKey = `cobia:scout:${account.toLowerCase()}`;
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [minApyPercent, setMinApyPercent] = useState(1);
  const [matches, setMatches] = useState<ScoutMatch[]>([]);
  const [error, setError] = useState<string>();
  const balances = useMemo(() => balancesFromPortfolio(snapshot), [snapshot]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEnabled(localStorage.getItem(storageKey) === "enabled");
      const savedFloor = Number(localStorage.getItem(`${storageKey}:min-apy`));
      if (Number.isFinite(savedFloor) && savedFloor >= 0) setMinApyPercent(savedFloor);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const scan = useCallback(async () => {
    setError(undefined);
    try {
      const response = await fetch("/api/markets", { cache: "no-store" });
      const body = await response.json() as { markets?: StoredMarketSummary[]; message?: string };
      if (!response.ok || !body.markets) throw new Error(body.message ?? "Scout scan failed.");
      const next = findScoutMatches(body.markets, balances, {
        minApyBps: Math.round(minApyPercent * 100),
      });
      setMatches(next);
      if ("Notification" in window && window.Notification.permission === "granted") {
        for (const match of next) {
          const noticeKey = `${storageKey}:notified:${match.quoteId}`;
          if (localStorage.getItem(noticeKey)) continue;
          const asset = supportedAsset(match.asset);
          new window.Notification(`Cobia Scout found a ${asset.displaySymbol} route`, {
            body: `${(match.apyBps / 100).toFixed(2)}% estimated pre-gas APY. Review bounds before acting.`,
          });
          localStorage.setItem(noticeKey, "true");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scout scan failed.");
    }
  }, [balances, minApyPercent, storageKey]);

  useEffect(() => {
    if (!ready || !enabled) return;
    const initial = window.setTimeout(() => void scan(), 0);
    const timer = window.setInterval(() => void scan(), scanIntervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [enabled, ready, scan]);

  async function enable(): Promise<void> {
    localStorage.setItem(storageKey, "enabled");
    localStorage.setItem(`${storageKey}:min-apy`, String(minApyPercent));
    if ("Notification" in window && window.Notification.permission === "default") {
      await window.Notification.requestPermission();
    }
    setEnabled(true);
  }

  function disable(): void {
    localStorage.removeItem(storageKey);
    setEnabled(false);
    setMatches([]);
  }

  return (
    <section className={styles.shell} aria-labelledby="scout-title">
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon}><Radar aria-hidden="true" size={19} /></span>
          <div><h2 id="scout-title">Wallet Scout</h2><p>Find live routes your current X Layer tokens can fund.</p></div>
        </div>
        <button className={`button ${enabled ? "button--quiet" : "button--primary"}`} type="button"
          onClick={enabled ? disable : () => void enable()}>
          {enabled ? null : <BellRing aria-hidden="true" size={16} />}
          {enabled ? "Disable Scout" : "Enable Scout"}
        </button>
      </div>
      <div className={styles.controls}>
        <label>Minimum estimated APY
          <input type="number" min="0" step="0.1" value={minApyPercent}
            onChange={(event) => setMinApyPercent(Math.max(0, Number(event.target.value)))}
            onBlur={() => localStorage.setItem(`${storageKey}:min-apy`, String(minApyPercent))} />
        </label>
        <span className={styles.status}>{enabled ? "Scanning every 60 seconds while Cobia is open." : "Off until you opt in."}</span>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {enabled && matches.length === 0 && !error ? <p className={styles.status}>No funded route currently clears your APY floor.</p> : null}
      <div className={styles.matches}>
        {matches.map((match) => {
          const asset = supportedAsset(match.asset);
          return <article className={styles.match} key={match.quoteId}>
            <AssetMark asset={asset.displaySymbol} size={34} />
            <div><strong>{(match.apyBps / 100).toFixed(2)}% estimated pre-gas APY</strong><small>{match.balance.toLocaleString("en-US")} {asset.displaySymbol} available</small></div>
            <Link href={`/requests/${match.requestId}`}>Review matched route</Link>
          </article>;
        })}
      </div>
      <p className={styles.boundary}>Scout reads public balances and quotes. It never signs or executes, and it does not send wallet data to X.</p>
    </section>
  );
}
