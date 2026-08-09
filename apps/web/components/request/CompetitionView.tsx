"use client";

import type { MarketSnapshot, RouteQuote, StablecoinPolicy } from "@cobia/domain";
import { Check, CircleAlert, Copy, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { quoteSelectionCommitment } from "../../lib/intents/commitments";
import styles from "./CompetitionView.module.css";

interface PublicRequest {
  requestId: string;
  state: string;
  policy: StablecoinPolicy;
  snapshot: MarketSnapshot | null;
  selectedQuoteId: string | null;
  quotes: RouteQuote[];
}

interface InjectedProvider {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function jsonMessage(input: unknown, fallback: string): string {
  return typeof input === "object" && input && "message" in input && typeof input.message === "string"
    ? input.message
    : fallback;
}

export function CompetitionView({ requestId }: { requestId: string }) {
  const [market, setMarket] = useState<PublicRequest>();
  const [pendingQuote, setPendingQuote] = useState<string>();
  const [error, setError] = useState<string>();
  const [challenge, setChallenge] = useState<string>();
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/requests/${requestId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(jsonMessage(body, "Could not load the quote market."));
    setMarket(body as PublicRequest);
  }, [requestId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(jsonMessage(body, "Could not load the quote market."));
        return body as PublicRequest;
      })
      .then((body) => { if (active) setMarket(body); })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load market.");
      });
    return () => { active = false; };
  }, [requestId]);

  async function select(quoteId: string): Promise<void> {
    setPendingQuote(quoteId);
    setError(undefined);
    try {
      if (!market) throw new Error("The quote market is not loaded.");
      const provider = (window as typeof window & { ethereum?: InjectedProvider }).ethereum;
      if (!provider) throw new Error("Connect the owner wallet to authorize this quote.");
      const ownerSignature = await provider.request({
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
      const response = await fetch(`/api/requests/${requestId}/quotes/${quoteId}/reveal`, { method: "POST" });
      if (response.status === 402) {
        setChallenge(response.headers.get("www-authenticate") ?? "Payment challenge issued");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(jsonMessage(body, "Paid reveal failed."));
      setRevealed(true);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paid reveal failed.");
    } finally {
      setPendingQuote(undefined);
    }
  }

  if (!market && !error) {
    return <main className={styles.loading}><LoaderCircle className="spin" /> Loading verified quotes…</main>;
  }
  if (!market) return <main className={styles.loading} role="alert">{error}</main>;

  return (
    <main className={styles.shell}>
      <header className={styles.intro}>
        <p className="eyebrow">Intent · {shortHash(requestId)}</p>
        <h1>Solver competition</h1>
        <p>Both solvers received the same X Layer block-bounded snapshot. Only verified summaries are public.</p>
        <div className={styles.facts}>
          <span><ShieldCheck size={15} /> {market.state.replaceAll("_", " ")}</span>
          <span>{market.snapshot ? `Block ${market.snapshot.blockNumber}` : "Snapshot pending"}</span>
          <span>Principal unmoved</span>
        </div>
      </header>

      {error ? <p className={styles.alert} role="alert"><CircleAlert size={17} /> {error}</p> : null}
      <section className={styles.grid} aria-label="Verified solver quotes">
        {market.quotes.map((quote, index) => {
          const selected = market.selectedQuoteId === quote.quoteId;
          return (
            <article className={`${styles.quote} ${index === 0 ? styles.leading : ""}`} key={quote.quoteId}>
              <div className={styles.quoteHead}>
                <div><span className={styles.rank}>0{index + 1}</span><h2>{quote.solverId}</h2></div>
                <span className={quote.verification.executable ? styles.verified : styles.rejected}>
                  {quote.verification.executable ? <Check size={14} /> : <CircleAlert size={14} />}
                  {quote.verification.executable ? "Executable" : "Rejected"}
                </span>
              </div>
              <dl className={styles.metrics}>
                <div><dt>Net APY</dt><dd>{(quote.expectedNetApyBps / 100).toFixed(2)}%</dd></div>
                <div><dt>Verifier score</dt><dd>{quote.verification.score}</dd></div>
                <div><dt>Risk</dt><dd>{quote.riskGrade}</dd></div>
                <div><dt>Reveal</dt><dd>0.10 USDC</dd></div>
              </dl>
              <div className={styles.commitment}><LockKeyhole size={14} /> Bundle {shortHash(quote.bundleHash)}</div>
              {quote.verification.errorCodes.length > 0 ? (
                <ul className={styles.errors}>{quote.verification.errorCodes.map((code) => <li key={code}>{code}</li>)}</ul>
              ) : null}
              {selected ? (
                <button className="button button--primary" onClick={() => reveal(quote.quoteId)} disabled={Boolean(pendingQuote) || revealed}>
                  {pendingQuote === quote.quoteId ? <LoaderCircle className="spin" size={16} /> : null}
                  {revealed ? "Route revealed" : "Pay winner & reveal"}
                </button>
              ) : (
                <button className="button button--quiet" onClick={() => select(quote.quoteId)} disabled={!quote.verification.executable || Boolean(market.selectedQuoteId) || Boolean(pendingQuote)}>
                  {pendingQuote === quote.quoteId ? <LoaderCircle className="spin" size={16} /> : null}
                  Select quote
                </button>
              )}
            </article>
          );
        })}
      </section>

      {challenge ? (
        <section className={styles.payment}>
          <div><p className="eyebrow">HTTP 402 · Agent handoff</p><h2>Payment challenge ready</h2></div>
          <p>Replay the protected reveal request through OKX Agentic Wallet. Cobia cannot sign this payment for you.</p>
          <button className="button button--quiet" onClick={() => navigator.clipboard.writeText(challenge)}><Copy size={15} /> Copy challenge</button>
        </section>
      ) : null}
    </main>
  );
}
