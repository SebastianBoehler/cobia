import type { AssetValuationV2 } from "@cobia/domain";
import { Check, ChevronDown, CircleAlert, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { PublicRouteQuote } from "../../lib/markets/active-quotes";
import type { PublicRouteSummaryV2 } from "../../lib/markets/route-summary";
import { riskGradeLabel } from "../../lib/markets/risk-grade";
import { formatUsdE8, type HorizonRouteEconomics } from "../../lib/markets/route-economics";
import { formattedAssetAmount } from "../routes/purchased-route-format";
import styles from "./CompetitionView.module.css";
import { PublicRoutePath } from "./PublicRoutePath";

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
  summary?: PublicRouteSummaryV2;
  valuations?: readonly AssetValuationV2[];
  economics?: HorizonRouteEconomics & { horizonDays: number };
  onSelect(): void;
  onReveal(): void;
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function quoteStatus(quote: PublicRouteQuote, active: boolean, selected: boolean): string {
  if (active) return quote.version === 1 ? "Bundle recomputed" : "Route authorized";
  if (selected) return "Quote expired";
  return quote.version === 1 ? "Bundle rejected" : "Route rejected";
}

function outcomeLabel(summary: PublicRouteSummaryV2, valuations: readonly AssetValuationV2[]) {
  const last = summary.steps.at(-1);
  if (!last) return "Principal stays in wallet";
  if (last.kind === "supply") {
    const previous = summary.steps.at(-2);
    const amount = previous?.kind === "swap"
      ? previous.minimumOutputAtomic
      : last.inputAtomic;
    const prefix = previous?.kind === "swap" ? "At least " : "Exact ";
    return `${prefix}${formattedAssetAmount(amount, last.asset, valuations)} supplied`;
  }
  if (last.kind === "lp") return "Bounded two-token LP mint";
  return `At least ${formattedAssetAmount(last.minimumOutputAtomic, last.tokenOut, valuations)}`;
}

function QuoteAction(props: CompetitionQuoteCardProps) {
  const authorized = props.quote.version === 1
    ? props.quote.verification.executable
    : props.quote.authorization.routeAuthorized;
  if (props.selected && props.purchasedRouteId) {
    return <Link className="button button--primary" href={`/routes/${props.purchasedRouteId}`}>View purchased route</Link>;
  }
  if (props.selected && props.paymentRecovery === "reconcile") {
    return <span className={styles.rejected}>Payment reconciliation required</span>;
  }
  if (props.selected && !props.active && !props.recoverable) {
    return <span className={styles.rejected}>Settlement unavailable</span>;
  }
  if (props.selected) {
    return (
      <button className="button button--primary" onClick={props.onReveal} disabled={props.busy || props.revealed}>
        {props.pending ? <LoaderCircle className="spin" size={16} /> : null}
        {props.revealed ? "Bundle revealed" : props.paymentRecovery === "recover"
          ? "Recover paid bundle" : props.paymentRecovery === "resume"
            ? "Resume payment" : "Pay & reveal bundle"}
      </button>
    );
  }
  return (
    <button className="button button--primary" onClick={props.onSelect} disabled={!authorized || props.selectionLocked || props.busy}>
      {props.pending ? <LoaderCircle className="spin" size={16} /> : null}
      Select quote
    </button>
  );
}

export function CompetitionQuoteCard(props: CompetitionQuoteCardProps) {
  const { quote, summary, valuations } = props;
  const errorCodes = quote.version === 1
    ? quote.verification.errorCodes
    : quote.authorization.errorCodes;
  const apyBps = quote.version === 1 ? quote.expectedNetApyBps : quote.estimatedPreGasApyBps;
  return (
    <article className={`${styles.quote} ${props.rank === 1 ? styles.leading : styles.alternative}`}>
      <div className={styles.quoteHead}>
        <div>
          <span className={styles.rank}>{props.rank}</span>
          <span>
            <h2>{props.rank === 1 ? "Best verified route" : quote.solverId}</h2>
            <small className={styles.operator}>
              <span>{quote.solverId}</span>
              <span> · operated by Cobia</span>
            </small>
          </span>
        </div>
        <span className={props.active ? styles.verified : styles.rejected}>
          {props.active ? <Check size={14} /> : <CircleAlert size={14} />}
          {quoteStatus(quote, props.active, props.selected)}
        </span>
      </div>

      {summary && valuations ? <PublicRoutePath summary={summary} valuations={valuations} /> : null}

      <dl className={styles.outcomes}>
        <div>
          <dt>You commit</dt>
          <dd>{summary && valuations
            ? formattedAssetAmount(summary.inputAtomic, summary.inputAsset, valuations)
            : "Signed principal"}</dd>
        </div>
        <div>
          <dt>Route outcome</dt>
          <dd className={styles.bound}>{summary && valuations
            ? outcomeLabel(summary, valuations)
            : quote.version === 2 ? "Authorized route" : "Recomputed allocation"}</dd>
        </div>
        <div>
          <dt>Estimated {summary?.horizonDays ?? props.economics?.horizonDays ?? 30}-day yield</dt>
          <dd className={styles.estimate}>{(apyBps / 100).toFixed(2)}%</dd>
          <small>{props.economics
            ? `${formatUsdE8(props.economics.estimatedGrossYieldUsdE8)} gross · gas excluded`
            : "Estimated APY · gas excluded"}</small>
        </div>
      </dl>

      {props.economics?.status === "not-economical" ? (
        <p className={styles.economicsWarning}>
          <strong>Not economical at this size</strong>
          <span>Estimated {props.economics.horizonDays}-day gross {formatUsdE8(props.economics.estimatedGrossYieldUsdE8)} · reveal {formatUsdE8(props.economics.revealFeeUsdE8)} · gas not included</span>
        </p>
      ) : null}

      <div className={styles.primaryAction}><QuoteAction {...props} /></div>
      <details className={styles.verificationDetails}>
        <summary>Verification & purchase details <ChevronDown aria-hidden="true" size={16} /></summary>
        <dl>
          <div><dt>Risk</dt><dd>{riskGradeLabel(quote.riskGrade)}</dd></div>
          <div><dt>Reveal</dt><dd>0.10 · 2 direct-recipient signatures</dd></div>
          <div><dt>Payment</dt><dd>One purchase: 0.09 signer + 0.01 Cobia</dd></div>
        </dl>
        <p>The token authorizes each recipient directly. Cobia never takes custody of the signer share.</p>
        <span className={styles.commitment}><LockKeyhole size={14} /> Bundle {shortHash(quote.bundleHash)}</span>
        {errorCodes.length > 0 ? <ul className={styles.errors}>{errorCodes.map((code) => <li key={code}>{code}</li>)}</ul> : null}
      </details>
    </article>
  );
}
