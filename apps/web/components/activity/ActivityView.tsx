"use client";

import Link from "next/link";
import { Activity, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import styles from "../product/ProductShell.module.css";

interface WalletEvent {
  id: string;
  kind: string;
  status: string;
  routeId: string | null;
  transactionHash: string | null;
  occurredAt: string;
}

export function ActivityView() {
  const wallet = useWallet();
  const [result, setResult] = useState<{ account: string; events?: WalletEvent[]; error?: string }>();
  useEffect(() => {
    if (!wallet.account) return;
    let active = true;
    const account = wallet.account;
    fetch(`/api/wallets/${wallet.account}/activity`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); return body.events as WalletEvent[]; })
      .then((body) => { if (active) setResult({ account, events: body }); })
      .catch((cause) => { if (active) setResult({ account, error: cause instanceof Error ? cause.message : "Activity read failed." }); });
    return () => { active = false; };
  }, [wallet.account]);

  if (!wallet.account) return <section className={styles.empty}><Activity size={28} /><h2>Connect your wallet</h2><p>Signatures, purchased routes, simulations, and transactions appear here in order.</p></section>;
  if (result?.account !== wallet.account) return <section className={styles.empty}><LoaderCircle className="spin" /><h2>Loading activity</h2></section>;
  if (result.error) return <section className={styles.empty}><CircleAlert /><h2>Activity unavailable</h2><p className={styles.error}>{result.error}</p></section>;
  const events = result.events;
  if (!events) return null;
  if (!events.length) return <section className={styles.empty}><Activity size={28} /><h2>No Cobia activity yet</h2><p>Your wallet has not purchased or executed a route.</p></section>;
  return <section className={styles.panel}><div className={styles.panelHeader}><h2>Wallet timeline</h2><span className={styles.badge}>{events.length} event{events.length === 1 ? "" : "s"}</span></div><div className={styles.rows}>
    {events.map((event) => <div className={styles.row} key={event.id}><div><strong>{event.kind.replaceAll("_", " ")}</strong><small>{new Date(event.occurredAt).toLocaleString()}</small></div><span>{event.status}</span>{event.routeId ? <Link href={`/routes/${event.routeId}`}>View route</Link> : <strong>—</strong>}</div>)}
  </div></section>;
}
