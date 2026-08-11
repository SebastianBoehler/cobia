"use client";

import { CircleAlert, FlaskConical, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { isAddress, isAddressEqual, toHex } from "viem";
import {
  buildExecutionRehearsalProof,
  executionRehearsalCommitment,
} from "../../lib/execution-v2/rehearsal-proof";
import type { ExecutionRehearsalTrace } from "../../lib/execution-v2/rehearsal-trace";
import { useWallet } from "../wallet/WalletProvider";
import { MainnetExecutionLedger } from "./MainnetExecutionLedger";
import type { PurchasedRouteV2 } from "./purchased-route";
import styles from "./PurchasedRouteView.module.css";

const labels = {
  "reset-aave-allowance": "Reset Aave allowance",
  "approve-aave-exact": "Approve Aave exact amount",
  "aave-v3-supply": "Supply to Aave V3",
  "reset-uniswap-allowance": "Reset Uniswap allowance",
  "approve-uniswap-exact": "Approve Uniswap exact amount",
  "uniswap-v3-exact-input": "Swap exact input on Uniswap V3",
  "reset-position-manager-allowance": "Reset Uniswap LP allowance",
  "approve-position-manager-exact": "Approve exact Uniswap LP amount",
  "uniswap-v3-full-range-mint": "Mint full-range Uniswap V3 position",
} as const;

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function nonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function responseMessage(value: unknown): string {
  return typeof value === "object" && value && "message" in value &&
    typeof value.message === "string"
    ? value.message
    : "The fork rehearsal could not be completed.";
}

function TraceLedger({ trace }: { trace: ExecutionRehearsalTrace }) {
  return (
    <div className={styles.execution}>
      <div className={styles.executionHeader}>
        <ShieldCheck size={19} />
        <div>
          <strong>Fork rehearsal passed</strong>
          <p>No wallet funds were used.</p>
        </div>
        <span>X Layer fork · block {trace.snapshot.blockNumber}</span>
      </div>
      <ol className={styles.executionSteps} aria-label="Fork execution trace">
        {trace.result.transactions.map((transaction, index) => (
          <li key={`${transaction.hash}:${transaction.label}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{labels[transaction.label]}</strong>
              <small>
                {shortHash(transaction.hash)} · block {transaction.blockNumber} · gas estimate {transaction.gasEstimate}
              </small>
            </div>
          </li>
        ))}
        {trace.result.transactions.length === 0 ? (
          <li><span>00</span><div><strong>No protocol transaction required</strong></div></li>
        ) : null}
      </ol>
      <p className={styles.executionBoundary}>
        Historical evidence at the quoted snapshot—not a current-price guarantee or mainnet transaction.
      </p>
    </div>
  );
}

export function PurchasedRouteExecution({ route }: { route: PurchasedRouteV2 }) {
  const wallet = useWallet();
  const [trace, setTrace] = useState<ExecutionRehearsalTrace | undefined>(
    route.rehearsal?.trace,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const buyerConnected = Boolean(
    wallet.account && isAddress(route.buyer) && isAddressEqual(wallet.account, route.buyer),
  );

  async function rehearse(): Promise<void> {
    if (!wallet.account || !buyerConnected) return;
    setPending(true);
    setError(undefined);
    try {
      const proof = buildExecutionRehearsalProof({
        realm: route.rehearsalRealm,
        routeId: route.id as `0x${string}`,
        bundleHash: route.quoteId as `0x${string}`,
        buyer: wallet.account,
        executionChainId: 196,
        nonce: nonce(),
        expiresAt: Math.floor(Date.now() / 1_000) + 240,
      });
      const signature = await wallet.request({
        method: "personal_sign",
        params: [executionRehearsalCommitment(proof), wallet.account],
      });
      if (typeof signature !== "string") throw new Error("Wallet returned an invalid signature.");
      const response = await fetch(`/api/routes/${route.id}/execution/rehearsal`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof, signature }),
      });
      const body = await response.json();
      if (!response.ok || body.state !== "passed" || !body.trace) {
        throw new Error(responseMessage(body));
      }
      setTrace(body.trace as ExecutionRehearsalTrace);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The fork rehearsal could not be completed.");
    } finally {
      setPending(false);
    }
  }

  if (trace) return <>
    <TraceLedger trace={trace} />
    <MainnetExecutionLedger route={route} trace={trace} />
  </>;
  return (
    <div className={styles.execution}>
      <div className={styles.executionHeader}>
        <FlaskConical size={19} />
        <div>
          <strong>Test the exact quote first</strong>
          <p>Replay this purchased bundle on an isolated X Layer mainnet fork.</p>
        </div>
      </div>
      {!buyerConnected ? (
        <p className={styles.executionBoundary}>
          Connect the purchasing wallet to rehearse this quote.
        </p>
      ) : null}
      {error ? <p className={styles.executionError} role="alert"><CircleAlert size={15} /> {error}</p> : null}
      <button
        className="button button--primary"
        type="button"
        disabled={pending || !buyerConnected}
        onClick={rehearse}
      >
        {pending ? <LoaderCircle className="spin" size={16} /> : null}
        {pending ? "Running isolated fork…" : "Rehearse exact quote on fork"}
      </button>
      <p className={styles.executionBoundary}>
        This asks for one proof signature only. It cannot approve, swap, or move wallet funds.
      </p>
    </div>
  );
}
