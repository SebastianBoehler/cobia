"use client";

import { Activity, BadgeCheck, CircleAlert, LoaderCircle, Radio, ReceiptText, Route } from "lucide-react";
import { useEffect, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { WalletButton } from "../wallet/WalletButton";
import styles from "../product/ProductShell.module.css";

interface WalletEvent {
  id: string;
  kind: string;
  status: string;
  routeId: string | null;
  transactionHash: string | null;
  occurredAt: string;
}

function eventTitle(kind: string): string {
  const titles: Record<string, string> = {
    route_revealed: "Route proof revealed",
    execution_started: "Execution started",
    execution_step_prepared: "Transaction prepared",
    execution_step_armed: "Transaction ready to broadcast",
    execution_step_submitted: "Transaction submitted",
    execution_step_confirmed: "Transaction confirmed",
    execution_completed: "Route execution completed",
    execution_failed: "Route execution failed",
    execution_reconciliation: "Execution reconciliation required",
  };
  return titles[kind] ?? kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function EventIcon({ kind }: { kind: string }) {
  if (kind === "route_revealed") return <ReceiptText aria-hidden="true" size={19} />;
  if (kind.includes("completed") || kind.includes("confirmed")) return <BadgeCheck aria-hidden="true" size={19} />;
  if (kind.includes("submitted") || kind.includes("armed")) return <Radio aria-hidden="true" size={19} />;
  return <Route aria-hidden="true" size={19} />;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function ActivityView() {
  const wallet = useWallet();
  const [result, setResult] = useState<{ account: string; events?: WalletEvent[]; error?: string }>();
  useEffect(() => {
    if (!wallet.account) return;
    let active = true;
    const account = wallet.account;
    fetch(`/api/wallets/${wallet.account}/activity`)
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); return body.events as WalletEvent[]; })
      .then((body) => { if (active) setResult({ account, events: body }); })
      .catch((cause) => { if (active) setResult({ account, error: cause instanceof Error ? cause.message : "Activity read failed." }); });
    return () => { active = false; };
  }, [wallet.account]);

  if (!wallet.account) return <section className={styles.empty}><Activity size={28} /><h2>Connect your wallet</h2><p>Signed policies, quote purchases, and payment receipts appear here in order.</p><WalletButton placement="empty-state" /></section>;
  if (result?.account !== wallet.account) return <section className={styles.empty}><LoaderCircle className="spin" /><h2>Loading activity</h2></section>;
  if (result.error) return <section className={styles.empty}><CircleAlert /><h2>Activity unavailable</h2><p className={styles.error}>{result.error}</p></section>;
  const events = result.events;
  if (!events) return null;
  if (!events.length) return <section className={styles.empty}><Activity size={28} /><h2>No Cobia activity yet</h2><p>Your wallet has not purchased a quote.</p></section>;
  return <section className={`${styles.panel} ${styles.widePanel}`}>
    <div className={styles.panelHeader}><div><h2>Wallet timeline</h2><p>Newest verifiable wallet events appear first.</p></div><span className={styles.badge}>{events.length} event{events.length === 1 ? "" : "s"}</span></div>
    <ol className={styles.timeline}>
      {events.map((event) => <li className={styles.timelineItem} key={event.id}>
        <span className={styles.timelineIcon}><EventIcon kind={event.kind} /></span>
        <div className={styles.timelineContent}>
          <h3>{eventTitle(event.kind)}</h3>
          <p>{new Date(event.occurredAt).toLocaleString()}</p>
          {event.transactionHash ? <small title={event.transactionHash}>Transaction {event.transactionHash.slice(0, 10)}…{event.transactionHash.slice(-6)}</small> : null}
        </div>
        <span className={`${styles.statusBadge} ${event.status === "failed" ? styles.statusFailed : ""}`}>{statusLabel(event.status)}</span>
        <span className={styles.timelineActionMuted}>{event.routeId ? "Archived route proof" : "No program link"}</span>
      </li>)}
    </ol>
  </section>;
}
