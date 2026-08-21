"use client";

import { commitment } from "@cobia/domain";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Hex } from "viem";
import {
  CommerceAuthorizationSubmissionError,
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
  const [uncertainAuthorization, setUncertainAuthorization] = useState<{
    placementId: string; authorizationNonce: string;
  }>();
  const [notSettled, setNotSettled] = useState<{
    placementId: string; authorizationNonce: string; merchantStatus: 402; merchantUrl: string;
  }>();

  async function buy() {
    if (!wallet.account) { setError("Connect the wallet that will own and pay for this intent."); return; }
    setPending(true); setError(undefined); setUncertainAuthorization(undefined); setNotSettled(undefined);
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
    } catch (cause) {
      if (cause instanceof CommerceAuthorizationSubmissionError) {
        if (cause.outcome?.kind === "not-settled") {
          setNotSettled({
            placementId: cause.placementId,
            authorizationNonce: cause.authorizationNonce,
            merchantStatus: cause.outcome.merchantStatus,
            merchantUrl: cause.outcome.merchantUrl,
          });
          return;
        }
        setUncertainAuthorization({ placementId: cause.placementId, authorizationNonce: cause.authorizationNonce });
      }
      setError(errorMessage(cause));
    }
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
      <p>Sign the bounded order first, then one exact authorization for the offer&apos;s pinned chain and asset. Cobia verifies the token transfer; delivery remains merchant-provided.</p>
      {submitted ? <pre className={styles.resource}>{resource}</pre> : null}
      {confirmed ? <p className="status status--live">Payment settlement confirmed</p> : null}
      {submitted ? <p className={styles.settlementLink}>
        <a href={`https://web3.okx.com/explorer/xlayer/tx/${submitted.transactionHash}`} target="_blank" rel="noreferrer">
          View settlement transaction on X Layer explorer
        </a>
      </p> : null}
      {notSettled ? <div className="form-alert" role="status">
        <strong>Not settled — no transaction exists.</strong>
        <p>Ethy AI rejected the signed payment credential (HTTP {notSettled.merchantStatus}). Cobia checked the authorization nonce on X Layer and it is unused, so no payment was transferred.</p>
        <p><a href={notSettled.merchantUrl} target="_blank" rel="noreferrer">Open Ethy AI&apos;s merchant resource</a> <span aria-hidden="true">·</span> Placement {notSettled.placementId} <span aria-hidden="true">·</span> Nonce {notSettled.authorizationNonce}</p>
      </div> : null}
      {uncertainAuthorization ? <p className="form-alert" role="status">
        Signed authorization outcome is pending review. Do not retry. Placement {uncertainAuthorization.placementId}; nonce {uncertainAuthorization.authorizationNonce}.
      </p> : error ? <p className="form-alert" role="alert">{error}</p> : null}
    </div>
    {!submitted && !uncertainAuthorization && !notSettled ? <button className="button button--primary" disabled={pending} onClick={buy}>
      {pending ? <><LoaderCircle className="spin" size={16} /> Preparing…</> : "Review and buy"}
    </button> : null}
    {submitted && !confirmed ? <button className="button button--primary" disabled={pending} onClick={verifySettlement}>
      {pending ? "Checking confirmations…" : "Verify settlement"}
    </button> : null}
  </section>;
}
