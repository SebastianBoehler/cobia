"use client";

import { ReceiptText } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { OkxAgentPaymentSnapshotV1 } from "../../lib/commerce/okx-agent-payments";
import styles from "./OkxAgentPaymentLookup.module.css";

function labelForStatus(status: string): string {
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

export function OkxAgentPaymentLookup() {
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState<OkxAgentPaymentSnapshotV1>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference.trim()) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/commerce/okx-agent-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      const body = await response.json() as { payment?: OkxAgentPaymentSnapshotV1; message?: string };
      if (!response.ok || !body.payment) throw new Error(body.message ?? "Payment lookup failed.");
      setPayment(body.payment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment lookup failed.");
      setPayment(undefined);
    } finally { setPending(false); }
  }

  return <section aria-labelledby="okx-agent-payment-title" className={styles.lookup}>
    <header className={styles.header}>
      <span aria-hidden="true" className={styles.mark}><ReceiptText size={20} /></span>
      <div>
        <h2 id="okx-agent-payment-title">Inspect an OKX Agent Payment</h2>
        <p>Read payment and settlement evidence without creating or signing a payment.</p>
      </div>
      <span className={styles.mode}>Read only</span>
    </header>
    <form className={styles.form} onSubmit={inspect}>
      <label>Payment ID or link
        <div>
          <input value={reference} onChange={(event) => setReference(event.target.value)} />
          <button className="button button--secondary" disabled={pending} type="submit">
            {pending ? "Inspecting…" : "Inspect payment"}
          </button>
        </div>
      </label>
    </form>
    {error ? <p className={styles.failure} role="alert">{error}</p> : null}
    {payment ? <article aria-label="Payment evidence" className={styles.result}>
      <div className={styles.resultHeading}>
        <div><h3>{payment.provider.displayName}</h3><code>{payment.paymentId}</code></div>
        <strong>{labelForStatus(payment.status)}</strong>
      </div>
      <dl>
        <div><dt>Amount</dt><dd>{payment.payment.atomicAmount} atomic</dd></div>
        <div><dt>Network</dt><dd>X Layer · chain {payment.payment.chainId}</dd></div>
        <div><dt>Asset</dt><dd>{payment.payment.asset}</dd></div>
        <div><dt>Recipient</dt><dd>{payment.payment.recipient}</dd></div>
        {payment.settlement ? <div><dt>Block</dt><dd>{payment.settlement.blockNumber}</dd></div> : null}
      </dl>
      {payment.settlement ? <a href={`https://web3.okx.com/explorer/xlayer/tx/${payment.settlement.transactionHash}`}
        rel="noreferrer" target="_blank">View settlement on X Layer</a> : null}
      <p className={styles.boundary}>Payment settlement is not proof of order fulfillment.</p>
    </article> : null}
  </section>;
}
