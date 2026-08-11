import { Check, CircleAlert, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { PublicRouteQuote } from "../../lib/markets/active-quotes";
import { riskGradeLabel } from "../../lib/markets/risk-grade";
import styles from "./CompetitionView.module.css";

export type PaymentRecovery = "none" | "resume" | "recover" | "reconcile";

interface CompetitionQuoteCardProps {
  quote: PublicRouteQuote;
  rank: number;
  selected: boolean;
  active: boolean;
  recoverable: boolean;
  purchasedRouteId: string | null;
  paymentRecovery: PaymentRecovery;
  selectionLocked: boolean;
  busy: boolean;
  pending: boolean;
  revealed: boolean;
  onSelect(): void;
  onReveal(): void;
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function quoteStatus(
  quote: PublicRouteQuote,
  active: boolean,
  selected: boolean,
): string {
  if (active) return quote.version === 1 ? "Bundle recomputed" : "Route authorized";
  if (selected) return "Quote expired";
  return quote.version === 1 ? "Bundle rejected" : "Route rejected";
}

function QuoteMetrics({ quote }: { quote: PublicRouteQuote }) {
  if (quote.version === 2) {
    return (
      <dl className={styles.metrics}>
        <div><dt>Estimated pre-gas APY</dt><dd>{(quote.estimatedPreGasApyBps / 100).toFixed(2)}%</dd></div>
        <div><dt>Route authorization</dt><dd>{quote.authorization.routeAuthorized ? "Authorized" : "Rejected"}</dd></div>
        <div><dt>Risk</dt><dd>{riskGradeLabel(quote.riskGrade)}</dd></div>
        <div><dt>Reveal</dt><dd>0.10</dd></div>
      </dl>
    );
  }
  return (
    <dl className={styles.metrics}>
      <div><dt>Net APY</dt><dd>{(quote.expectedNetApyBps / 100).toFixed(2)}%</dd></div>
      <div><dt>Verifier score</dt><dd>{quote.verification.score}</dd></div>
      <div><dt>Risk</dt><dd>{riskGradeLabel(quote.riskGrade)}</dd></div>
      <div><dt>Reveal</dt><dd>0.10</dd></div>
    </dl>
  );
}

export function CompetitionQuoteCard(props: CompetitionQuoteCardProps) {
  const { quote } = props;
  const authorized = quote.version === 1
    ? quote.verification.executable
    : quote.authorization.routeAuthorized;
  const errorCodes = quote.version === 1
    ? quote.verification.errorCodes
    : quote.authorization.errorCodes;
  return (
    <article className={`${styles.quote} ${props.rank === 1 ? styles.leading : ""}`}>
      <div className={styles.quoteHead}>
        <div>
          <span className={styles.rank}>{String(props.rank).padStart(2, "0")}</span>
          <span><h2>{quote.solverId}</h2><small className={styles.operator}>Operated by Cobia</small></span>
        </div>
        <span className={props.active ? styles.verified : styles.rejected}>
          {props.active ? <Check size={14} /> : <CircleAlert size={14} />}
          {quoteStatus(quote, props.active, props.selected)}
        </span>
      </div>
      <QuoteMetrics quote={quote} />
      <div className={styles.feeSplit}><span>0.09 to quote signer</span><span>0.01 to Cobia</span></div>
      <div className={styles.commitment}><LockKeyhole size={14} /> Bundle {shortHash(quote.bundleHash)}</div>
      {errorCodes.length > 0 ? (
        <ul className={styles.errors}>{errorCodes.map((code) => <li key={code}>{code}</li>)}</ul>
      ) : null}
      {props.selected && props.purchasedRouteId ? (
        <Link className="button button--primary" href={`/routes/${props.purchasedRouteId}`}>
          View purchased route
        </Link>
      ) : props.selected && props.paymentRecovery === "reconcile" ? (
        <span className={styles.rejected}>Payment reconciliation required</span>
      ) : props.selected && !props.active && !props.recoverable ? (
        <span className={styles.rejected}>Settlement unavailable</span>
      ) : props.selected ? (
        <button className="button button--primary" onClick={props.onReveal} disabled={props.busy || props.revealed}>
          {props.pending ? <LoaderCircle className="spin" size={16} /> : null}
          {props.revealed
            ? "Bundle revealed"
            : props.paymentRecovery === "recover"
              ? "Recover paid bundle"
              : props.paymentRecovery === "resume"
                ? "Resume payment"
                : "Pay & reveal bundle"}
        </button>
      ) : (
        <button className="button button--quiet" onClick={props.onSelect} disabled={!authorized || props.selectionLocked || props.busy}>
          {props.pending ? <LoaderCircle className="spin" size={16} /> : null}
          Select quote
        </button>
      )}
    </article>
  );
}
