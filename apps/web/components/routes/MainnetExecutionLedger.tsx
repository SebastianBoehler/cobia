"use client";

import { CircleAlert, ExternalLink, Landmark, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { isAddress, isAddressEqual, type Hash } from "viem";
import {
  advanceMainnetExecutionV2,
  startMainnetExecutionV2,
  submitMainnetExecutionStepV2,
  type MainnetExecutionSessionV2,
} from "../../lib/execution-v2/mainnet-execution-client";
import type { ExecutionRehearsalTrace } from "../../lib/execution-v2/rehearsal-trace";
import { useWallet } from "../wallet/WalletProvider";
import type { PurchasedRouteV2 } from "./purchased-route";
import styles from "./PurchasedRouteView.module.css";

const labels: Record<string, string> = {
  "reset-aave-allowance": "Reset Aave allowance",
  "approve-aave-exact": "Approve Aave exact amount",
  "aave-v3-supply": "Supply to Aave V3",
  "reset-curve-allowance": "Reset Curve allowance",
  "approve-curve-exact": "Approve Curve exact amount",
  "curve-stableswap-ng-exact-input": "Swap exact input on Curve StableSwap NG",
  "reset-uniswap-allowance": "Reset Uniswap allowance",
  "approve-uniswap-exact": "Approve Uniswap exact amount",
  "uniswap-v3-exact-input": "Swap exact input on Uniswap V3",
  "reset-position-manager-allowance": "Reset Uniswap LP allowance",
  "approve-position-manager-exact": "Approve exact Uniswap LP amount",
  "uniswap-v3-full-range-mint": "Mint full-range Uniswap V3 position",
};

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Mainnet execution could not continue.";
}

function isUserRejection(cause: unknown) {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === 4001;
}

function explorer(hash: string) {
  return `https://web3.okx.com/explorer/xlayer/tx/${hash}`;
}

export function MainnetExecutionLedger({
  route,
  trace,
}: {
  route: PurchasedRouteV2;
  trace: ExecutionRehearsalTrace;
}) {
  const wallet = useWallet();
  const [session, setSession] = useState<MainnetExecutionSessionV2>();
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string>();
  const buyerConnected = Boolean(wallet.account && isAddress(route.buyer) &&
    isAddressEqual(wallet.account, route.buyer));
  const currentSubmitted = session?.steps.findLast((step) => step.state === "submitted");
  const broadcasting = session?.preparedStep?.state === "broadcasting";
  const preparedLabel = session?.preparedStep &&
    typeof session.preparedStep.semantic === "object" && session.preparedStep.semantic &&
    "label" in session.preparedStep.semantic &&
    typeof session.preparedStep.semantic.label === "string"
    ? labels[session.preparedStep.semantic.label] ?? session.preparedStep.semantic.label
    : "Prepared transaction";

  async function start() {
    if (!wallet.account || !buyerConnected) return;
    setPending(true);
    setError(undefined);
    try {
      setSession(await startMainnetExecutionV2({
        routeId: route.id as Hash,
        bundleHash: route.quoteId as Hash,
        realm: route.rehearsalRealm,
        trace,
        wallet: { account: wallet.account, request: wallet.request,
          switchToXLayer: wallet.switchToXLayer },
      }));
      setUncertain(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  async function submit() {
    if (!session || !wallet.account || !buyerConnected) return;
    setPending(true);
    setError(undefined);
    try {
      const updated = await submitMainnetExecutionStepV2({
        routeId: route.id as Hash,
        policy: route.policy,
        snapshot: route.snapshot,
        bundle: route.bundle,
        session,
        wallet: { account: wallet.account, request: wallet.request,
          switchToXLayer: wallet.switchToXLayer },
      });
      setSession(updated);
      setUncertain(false);
    } catch (cause) {
      setUncertain(!isUserRejection(cause));
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  async function advance(action: "resolve" | "recover", ordinal: number) {
    if (!session) return;
    setPending(true);
    setError(undefined);
    try {
      const updated = await advanceMainnetExecutionV2({
        routeId: route.id as Hash,
        session,
        action: { action, ordinal },
      });
      setSession(updated);
      setUncertain(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.mainnetExecution}>
      <div className={styles.executionHeader}>
        <Landmark size={19} />
        <div>
          <strong>Guided X Layer mainnet execution</strong>
          <p>This path uses real X Layer mainnet funds. Every approval, swap, supply, or LP mint is a separate OKX Wallet confirmation.</p>
        </div>
        <span>Chain 196</span>
      </div>

      <div className={styles.executionGuardrail}>
        <ShieldCheck size={17} />
        <span>Cobia rebuilds and verifies the purchased route, pinned contracts, nonce, calldata, current balances, and gas before each prompt. It never receives your private key.</span>
      </div>

      {session?.steps.length ? (
        <ol className={styles.executionSteps} aria-label="Mainnet execution ledger">
          {session.steps.map((step) => (
            <li key={step.ordinal}>
              <span>{String(step.ordinal + 1).padStart(2, "0")}</span>
              <div>
                <strong>{labels[step.label ?? ""] ?? step.label ?? step.kind}</strong>
                <small>{step.state}{step.transactionHash ? " · verified transaction" : ""}</small>
              </div>
              {step.transactionHash ? (
                <a href={explorer(step.transactionHash)} target="_blank" rel="noreferrer"
                  aria-label={`Open transaction ${step.ordinal + 1} in explorer`}>
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {session?.preparedStep ? (
        <div className={styles.preparedStep}>
          <span>Next wallet prompt</span>
          <strong>{preparedLabel}</strong>
          <small>Target {String(session.preparedStep.to).slice(0, 10)}… · value 0 OKB · gas estimate {String(session.preparedStep.gasEstimateAtomic)}</small>
        </div>
      ) : null}

      {session?.attempt.state === "complete" ? (
        <p className={styles.executionComplete}><ShieldCheck size={17} /> Route execution complete</p>
      ) : null}
      {session?.attempt.state === "reconcile" ? (
        <p className={styles.executionError}><CircleAlert size={15} /> A submitted transaction needs manual reconciliation. Do not resend it.</p>
      ) : null}
      {!buyerConnected ? (
        <p className={styles.executionBoundary}>Connect the purchasing wallet to authorize mainnet execution.</p>
      ) : null}
      {error ? <p className={styles.executionError} role="alert"><CircleAlert size={15} /> {error}</p> : null}

      {!session ? (
        <button className="button button--primary" type="button"
          disabled={pending || !buyerConnected} onClick={start}>
          {pending ? <LoaderCircle className="spin" size={16} /> : null}
          {pending ? "Authorizing…" : "Start guided mainnet execution"}
        </button>
      ) : session.preparedStep && !broadcasting && !uncertain ? (
        <button className="button button--primary" type="button" disabled={pending}
          onClick={submit}>
          {pending ? <LoaderCircle className="spin" size={16} /> : null}
          {pending ? "Checking and opening wallet…" : `Review in wallet: ${preparedLabel}`}
        </button>
      ) : uncertain || broadcasting ? (
        <button className="button button--secondary" type="button" disabled={pending}
          onClick={() => advance("recover", session.attempt.nextOrdinal)}>
          {pending ? "Scanning chain…" : "Recover submitted transaction"}
        </button>
      ) : currentSubmitted ? (
        <button className="button button--secondary" type="button" disabled={pending}
          onClick={() => advance("resolve", currentSubmitted.ordinal)}>
          {pending ? "Checking receipt…" : "Check transaction status"}
        </button>
      ) : null}

      <p className={styles.executionBoundary}>
        No transaction is automatic. If a wallet prompt stays open past the quote deadline, reject it and create a fresh quote.
      </p>
    </div>
  );
}
