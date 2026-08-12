"use client";

import type { PersistedSnapshot, PersistedStablecoinPolicy } from "@cobia/domain";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isAddressEqual } from "viem";
import { quoteSelectionCommitment } from "../../lib/intents/commitments";
import {
  type ActiveQuoteFreshness,
  type PublicRouteQuote,
  activeQuoteFreshness,
  isActiveRouteQuote,
  refreshDelayMs,
  visibleRequestQuotes,
} from "../../lib/markets/active-quotes";
import { authorizePayment } from "../../lib/payments/eip3009";
import { buildRevealProof, revealProofCommitment } from "../../lib/payments/reveal-proof";
import { randomBytes32 } from "../../lib/payments/random";
import { PaymentTermsSchema, hashPaymentTerms, type PaymentTerms } from "../../lib/payments/terms";
import type { PublicRouteSummaryV2 } from "../../lib/markets/route-summary";
import { useWallet } from "../wallet/WalletProvider";
import { PurchasedRouteView, type PurchasedRoute } from "../routes/PurchasedRouteView";
import {
  CompetitionQuoteCard,
  type PaymentRecovery,
} from "./CompetitionQuoteCard";
import styles from "./CompetitionView.module.css";
import { quoteEconomics } from "./competition-economics";
import { CompetitionMarketHeader } from "./CompetitionMarketHeader";

interface PublicRequest {
  requestId: string;
  state: string;
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot | null;
  selectedQuoteId: string | null;
  purchasedRouteId: string | null;
  paymentTerms?: PaymentTerms;
  paymentRecovery: PaymentRecovery;
  freshness: ActiveQuoteFreshness;
  quotes: PublicRouteQuote[];
  routeSummaries?: Record<string, PublicRouteSummaryV2>;
}
function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function jsonMessage(input: unknown, fallback: string): string {
  const body = typeof input === "object" && input ? input as Record<string, unknown> : {};
  return [body.message, body.detail, body.title]
    .find((value): value is string => typeof value === "string") ?? fallback;
}

const recoveryExpirySec = () => Math.floor(Date.now() / 1_000) + 240;

function withVisibleQuotes(market: PublicRequest): PublicRequest {
  return {
    ...market,
    quotes: visibleRequestQuotes(market, market.freshness.observedAtSec),
  };
}

export function CompetitionView({ requestId }: { requestId: string }) {
  const wallet = useWallet();
  const [market, setMarket] = useState<PublicRequest>();
  const [pendingQuote, setPendingQuote] = useState<string>();
  const [error, setError] = useState<string>();
  const [revealed, setRevealed] = useState(false);
  const [purchasedRoute, setPurchasedRoute] = useState<PurchasedRoute>();

  const load = useCallback(async () => {
    const response = await fetch(`/api/requests/${requestId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(jsonMessage(body, "Could not load the solver market."));
    setMarket(withVisibleQuotes(body as PublicRequest));
  }, [requestId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(jsonMessage(body, "Could not load the solver market."));
        return withVisibleQuotes(body as PublicRequest);
      })
      .then((body) => { if (active) setMarket(body); })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load market.");
      });
    return () => { active = false; };
  }, [requestId]);

  useEffect(() => {
    if (!market) return;
    const delayMs = refreshDelayMs(market.freshness);
    const observedAtSec = market.freshness.nextExpirySec;
    if (delayMs === null || observedAtSec === null) return;
    const reachesExpiry = delayMs === Math.max(0, (observedAtSec - market.freshness.observedAtSec) * 1_000);
    const timer = window.setTimeout(() => {
      if (reachesExpiry) setMarket((current) => current
        ? withVisibleQuotes({
          ...current,
          freshness: activeQuoteFreshness(current.quotes, observedAtSec),
        })
        : current);
      void load().catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Could not refresh market.");
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [load, market]);

  async function select(quoteId: string): Promise<void> {
    setPendingQuote(quoteId);
    setError(undefined);
    try {
      if (!market) throw new Error("The solver market is not loaded.");
      if (!wallet.account) throw new Error("Connect the owner wallet to authorize this quote.");
      if (!isAddressEqual(wallet.account, market.policy.owner)) {
        throw new Error(`Connect request owner ${shortHash(market.policy.owner)} to select a quote.`);
      }
      await wallet.switchToXLayer();
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [quoteSelectionCommitment(requestId, quoteId), market.policy.owner],
      });
      if (typeof ownerSignature !== "string") {
        throw new Error("Wallet returned an invalid quote-selection signature.");
      }
      const response = await fetch(`/api/requests/${requestId}/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, ownerSignature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(jsonMessage(body, "Selection failed."));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Selection failed.");
    } finally {
      setPendingQuote(undefined);
    }
  }

  async function reveal(quoteId: string): Promise<void> {
    setPendingQuote(quoteId);
    setError(undefined);
    try {
      if (!market) throw new Error("The solver market is not loaded.");
      if (!wallet.account) throw new Error("Connect the owner wallet to pay and reveal this bundle.");
      if (!isAddressEqual(wallet.account, market.policy.owner)) {
        throw new Error(`Connect request owner ${shortHash(market.policy.owner)} to reveal this quote.`);
      }
      if (!market.paymentTerms) throw new Error("Payment terms are unavailable for this quote.");
      const terms = PaymentTermsSchema.parse(market.paymentTerms);
      if (terms.externalId.toLowerCase() !== quoteId.toLowerCase()) {
        throw new Error("Payment terms do not belong to the selected quote.");
      }
      const proof = buildRevealProof({
        realm: terms.realm,
        requestId,
        quoteId: quoteId as `0x${string}`,
        owner: market.policy.owner,
        paymentChainId: terms.paymentChainId,
        executionChainId: market.policy.executionChainId,
        paymentTermsHash: hashPaymentTerms(terms),
        nonce: randomBytes32(),
        expiresAt: market.paymentRecovery === "recover"
          ? recoveryExpirySec()
          : terms.expiresAt,
      });
      const ownerSignature = await wallet.request({
        method: "personal_sign",
        params: [revealProofCommitment(proof), market.policy.owner],
      });
      if (typeof ownerSignature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(ownerSignature)) {
        throw new Error("Wallet returned an invalid reveal-proof signature.");
      }
      const payload = JSON.stringify({ proof, ownerSignature });
      const url = `/api/requests/${requestId}/quotes/${quoteId}/reveal`;
      let response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const credentialRequired = response.status === 402;
      if (credentialRequired) {
        const authorization = await authorizePayment(response, {
          account: wallet.account,
          request: wallet.request,
          switchChain: wallet.switchChain,
        }, { terms, owner: market.policy.owner });
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: payload,
        });
      }
      const body = await response.json();
      if (!response.ok) {
        if (credentialRequired) await load().catch(() => undefined);
        throw new Error(jsonMessage(body, "Paid reveal failed."));
      }
      if (!body.route) throw new Error("Payment settled but the purchased quote was not returned.");
      setPurchasedRoute(body.route as PurchasedRoute);
      setRevealed(true);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paid reveal failed.");
    } finally {
      setPendingQuote(undefined);
    }
  }

  if (!market && !error) {
    return <main className={styles.loading}><LoaderCircle className="spin" /> Loading solver market…</main>;
  }
  if (!market) return <main className={styles.loading} role="alert">{error}</main>;

  return (
    <main className={styles.shell}>
      <CompetitionMarketHeader requestId={requestId} state={market.state} policy={market.policy}
        snapshot={market.snapshot} quotes={market.quotes} />

      {error ? <p className={styles.alert} role="alert"><CircleAlert size={17} /> {error}</p> : null}
      {market.quotes.length === 0 ? (
        <section className={styles.grid} aria-label="Quote eligibility status">
          <article className={styles.quote}>
            <h2>No eligible quote</h2>
            <p>{market.policy.version === 1
              ? "No verifier-executable quote remains within its validity window."
              : "No route-authorized quote remains within its validity window."}</p>
            <Link className="button button--primary" href="/requests/new">Create fresh request</Link>
          </article>
        </section>
      ) : <section className={styles.grid} aria-label={market.policy.version === 1
        ? "Deterministic Aave V3 allocation quote"
        : "Verified X Layer solver quotes"}>
        {market.quotes.map((quote, index) => {
          const selected = market.selectedQuoteId === quote.quoteId;
          const activeQuote = isActiveRouteQuote(quote, market.freshness.observedAtSec);
          const recoverable = market.paymentRecovery === "recover"
            || (market.paymentRecovery === "resume" && activeQuote);
          return <CompetitionQuoteCard
            key={quote.quoteId}
            quote={quote}
            rank={index + 1}
            selected={selected}
            active={activeQuote}
            recoverable={recoverable}
            purchasedRouteId={market.purchasedRouteId}
            paymentRecovery={market.paymentRecovery}
            selectionLocked={Boolean(market.selectedQuoteId)}
            busy={Boolean(pendingQuote)}
            pending={pendingQuote === quote.quoteId}
            revealed={revealed}
            summary={market.routeSummaries?.[quote.quoteId]}
            valuations={market.snapshot?.version === 2 ? market.snapshot.valuations : undefined}
            economics={quoteEconomics({
              policy: market.policy,
              snapshot: market.snapshot,
              quote,
            })}
            onSelect={() => select(quote.quoteId)}
            onReveal={() => reveal(quote.quoteId)}
          />;
        })}
      </section>}
      {purchasedRoute ? <PurchasedRouteView route={purchasedRoute} /> : null}
    </main>
  );
}
