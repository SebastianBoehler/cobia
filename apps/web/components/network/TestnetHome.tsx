"use client";

import { ArrowRight, CheckCircle2, FlaskConical, LockKeyhole, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "../layout/AppHeader";
import styles from "./TestnetHome.module.css";

interface NetworkStatus {
  chainId: 1952;
  blockNumber: string;
  state: "paused";
  contracts: Record<"registry" | "riskManager" | "executor", {
    address: string;
    verified: true;
  }>;
}

const labels = {
  registry: "Adapter registry",
  riskManager: "Risk manager",
  executor: "Bounded executor",
} as const;

export function TestnetHome() {
  const [status, setStatus] = useState<NetworkStatus>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    fetch("/api/network/status", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Testnet status read failed.");
        return body as NetworkStatus;
      })
      .then((body) => { if (active) setStatus(body); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Testnet status read failed."); });
    return () => { active = false; };
  }, []);

  return <>
    <AppHeader />
    <main className={styles.page} id="main-content">
      <section className={styles.hero}>
        <div className={styles.copy}>
          <h1>Test safely on X Layer.</h1>
          <p>This host is isolated to chain 1952. Connect a dedicated wallet, inspect testnet OKB, and verify Cobia&apos;s empty paused deployment without touching mainnet funds.</p>
          <div className={styles.actions}>
            <Link className="button button--primary" href="/portfolio">View testnet wallet <ArrowRight aria-hidden="true" size={17} /></Link>
            <a className="text-link" href="https://www.oklink.com/x-layer-test" rel="noreferrer" target="_blank">Open explorer</a>
          </div>
          <p className={styles.warning}><FlaskConical aria-hidden="true" size={17} /> Testnet tokens have no cash value. Do not send mainnet assets here.</p>
        </div>
        <article className={styles.statusCard} aria-live="polite">
          <header><div><strong>Deployment status</strong><span>Direct chain read</span></div><span className={styles.locked}>Execution locked</span></header>
          <dl className={styles.facts}>
            <div><dt>Network</dt><dd>Chain 1952</dd></div>
            <div><dt>State</dt><dd>Registry + risk paused</dd></div>
            <div><dt>Capabilities</dt><dd>None activated</dd></div>
          </dl>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {!status && !error ? <p className={styles.loading}>Reading pinned deployment identities…</p> : null}
          {status ? <>
            <p className={styles.verified}><CheckCircle2 aria-hidden="true" size={16} /> Verified at block {Number(status.blockNumber).toLocaleString("en-US")}</p>
            <ul className={styles.contracts}>
              {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <li key={key}>
                <div><strong>{labels[key]}</strong><span>{status.contracts[key].address}</span></div>
                <small>Code verified</small>
              </li>)}
            </ul>
          </> : null}
        </article>
      </section>
      <section className={styles.boundary}>
        <LockKeyhole aria-hidden="true" size={22} />
        <div><h2>Rehearsal only</h2><p>The deployment is intentionally paused and has no enabled tokens or protocol capabilities. Intent creation, solver markets, and execution stay unavailable on this host until a separate testnet manifest is verified.</p></div>
        <WalletCards aria-hidden="true" size={22} />
      </section>
    </main>
  </>;
}
