"use client";

import { commitment } from "@cobia/domain";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Hex } from "viem";
import {
  authorizeCommercePlacementClientV1,
  confirmCommerceSettlementClientV1,
  prepareCommercePlacementClientV1,
} from "../../lib/commerce/placement-client";
import { useWallet } from "../wallet/WalletProvider";
import styles from "./CommercePurchaseAction.module.css";

type Proposal = { policy: Record<string, unknown>; program: Record<string, unknown>;
  evidence: Record<string, unknown> };
type Submitted = Awaited<ReturnType<typeof authorizeCommercePlacementClientV1>>;

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "The verified purchase could not continue.";
}

export function CommercePurchaseAction({ offerCommitment }: { offerCommitment: string }) {
  const wallet = useWallet();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState<Submitted>();
  const [confirmed, setConfirmed] = useState(false);

  async function buy() {
    if (!wallet.account) { setError("Connect the wallet that will own and pay for this intent."); return; }
    setPending(true); setError(undefined);
    try {
      const proposalResponse = await fetch(`/api/commerce/offers/${offerCommitment}/proposal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wallet.account }),
      });
      const proposalBody = await proposalResponse.json();
      if (!proposalResponse.ok) throw new Error(proposalBody.message ?? "No fresh purchase proposal is available.");
      const proposal = proposalBody as Proposal;
      const ownerSignature = await wallet.request({ method: "personal_sign",
        params: [commitment(proposal.policy), wallet.account] });
      if (typeof ownerSignature !== "string") throw new Error("Wallet returned an invalid intent signature.");
      const placement = await prepareCommercePlacementClientV1({ ...proposal, ownerSignature });
      await wallet.switchChain(placement.authorization.chainId);
      const authorization = await authorizeCommercePlacementClientV1({ ...placement,
        wallet: { signTypedData: async (typedData) => {
          const serialized = JSON.stringify(typedData,
            (_key, value) => typeof value === "bigint" ? value.toString() : value);
          const signature = await wallet.request({ method: "eth_signTypedData_v4",
            params: [wallet.account, serialized] });
          if (typeof signature !== "string") throw new Error("Wallet returned an invalid payment signature.");
          return signature as Hex;
        } },
      });
      setSubmitted(authorization);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }

  async function verifySettlement() {
    if (!submitted) return;
    setPending(true); setError(undefined);
    try {
      await confirmCommerceSettlementClientV1(submitted);
      setConfirmed(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  }

  const resource = submitted
    ? new TextDecoder().decode(Uint8Array.from(atob(submitted.resourceBodyBase64), (char) => char.charCodeAt(0)))
    : undefined;
  return <section className={styles.purchase} aria-labelledby="commerce-purchase-title">
    <ShieldCheck aria-hidden="true" size={22} />
    <div>
      <h2 id="commerce-purchase-title">Verified purchase intent</h2>
      <p>Sign the bounded order first, then one exact Base USDC authorization. Cobia verifies the token transfer; delivery remains merchant-provided.</p>
      {submitted ? <pre className={styles.resource}>{resource}</pre> : null}
      {confirmed ? <p className="status status--live">Payment settlement confirmed</p> : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
    </div>
    {!submitted ? <button className="button button--primary" disabled={pending} onClick={buy}>
      {pending ? <><LoaderCircle className="spin" size={16} /> Preparing…</> : "Review and buy"}
    </button> : null}
    {submitted && !confirmed ? <button className="button button--primary" disabled={pending} onClick={verifySettlement}>
      {pending ? "Checking confirmations…" : "Verify settlement"}
    </button> : null}
  </section>;
}
