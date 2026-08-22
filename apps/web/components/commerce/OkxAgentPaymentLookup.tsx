"use client";

import { useState, type FormEvent } from "react";

type PaymentSnapshot = {
  provider: { id: string; displayName: string };
  paymentId: string;
  status: string;
  payment: { atomicAmount: string };
  settlement: { transactionHash: string } | null;
};

function labelForStatus(status: string): string {
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

export function OkxAgentPaymentLookup() {
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState<PaymentSnapshot>();
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
      const body = await response.json() as { payment?: PaymentSnapshot; message?: string };
      if (!response.ok || !body.payment) throw new Error(body.message ?? "Payment lookup failed.");
      setPayment(body.payment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment lookup failed.");
      setPayment(undefined);
    } finally { setPending(false); }
  }

  return <section aria-labelledby="okx-agent-payment-title">
    <h2 id="okx-agent-payment-title">Inspect an OKX Agent Payment</h2>
    <form onSubmit={inspect}>
      <label>Payment ID or link
        <input value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <button disabled={pending} type="submit">{pending ? "Inspecting…" : "Inspect payment"}</button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {payment ? <article aria-label="Payment evidence">
      <p>{labelForStatus(payment.status)}</p>
      <h3>{payment.provider.displayName}</h3>
      <p>{payment.payment.atomicAmount} atomic</p>
      {payment.settlement ? <a href={`https://web3.okx.com/explorer/xlayer/tx/${payment.settlement.transactionHash}`}
        rel="noreferrer" target="_blank">View settlement on X Layer</a> : null}
      <p>Payment settlement is not proof of order fulfillment.</p>
    </article> : null}
  </section>;
}
