"use client";

import { CircleAlert, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { routeAccessCommitment } from "../../lib/intents/commitments";
import { useWallet } from "../wallet/WalletProvider";
import { PurchasedRouteView, type PurchasedRoute } from "./PurchasedRouteView";
import styles from "./RouteAccessView.module.css";

function message(input: unknown): string {
  return typeof input === "object" && input && "message" in input && typeof input.message === "string"
    ? input.message
    : "Could not unlock the purchased quote.";
}

export function RouteAccessView({ routeId }: { routeId: string }) {
  const wallet = useWallet();
  const [route, setRoute] = useState<PurchasedRoute>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function unlock(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      if (!wallet.account) throw new Error("Connect the buyer wallet to unlock this quote.");
      const timestamp = Math.floor(Date.now() / 1_000);
      const proof = routeAccessCommitment(routeId, wallet.account, timestamp);
      const signature = await wallet.request({ method: "personal_sign", params: [proof, wallet.account] });
      if (typeof signature !== "string") throw new Error("Wallet returned an invalid quote-access signature.");
      const response = await fetch(`/api/routes/${routeId}`, {
        cache: "no-store",
        headers: {
          "X-Cobia-Buyer": wallet.account,
          "X-Cobia-Signature": signature,
          "X-Cobia-Timestamp": String(timestamp),
        },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(message(body));
      setRoute(body as PurchasedRoute);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock the purchased quote.");
    } finally {
      setPending(false);
    }
  }

  if (route) return <main className={styles.page} id="main-content"><PurchasedRouteView route={route} /></main>;
  return (
    <main className={styles.page} id="main-content">
      <section className={styles.gate}>
        <span><LockKeyhole size={21} /></span>
        <h1>Unlock your purchased quote</h1>
        <p>The signed allocation bundle is private. Sign a message with the buyer wallet to recover it; principal remains unmoved.</p>
        {error ? <p className={styles.error} role="alert"><CircleAlert size={16} /> {error}</p> : null}
        <button className="button button--primary" onClick={unlock} disabled={pending || !wallet.account}>
          {pending ? <LoaderCircle className="spin" size={16} /> : null}
          {wallet.account ? "Sign and show quote" : "Connect buyer wallet first"}
        </button>
      </section>
    </main>
  );
}
