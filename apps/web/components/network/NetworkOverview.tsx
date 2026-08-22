import type { NetworkMetricsV1, PublicOutcomeV1 } from "@cobia/domain";
import { ArrowRight, ArrowUpRight, CircleAlert, Route } from "lucide-react";
import Link from "next/link";
import { formatUnits } from "viem";
import styles from "./NetworkOverview.module.css";

export interface NetworkOverviewReport {
  version: 1;
  observedAt: number;
  window: "30d" | "all";
  metrics: NetworkMetricsV1;
  outcomes: PublicOutcomeV1[];
  nextCursor: string | null;
  exclusions: Record<string, number>;
}

export interface NetworkSolverEvidence {
  id: string;
  displayName: string;
  stats: { accepted: number; rejected: number; wins: number; current: number };
}

function usd(value: string): string {
  return `$${formatUnits(BigInt(value), 8)}`;
}

function principal(outcome: PublicOutcomeV1): string {
  const amount = outcome.principal.decimals === null
    ? `${outcome.principal.atomic} atomic`
    : formatUnits(BigInt(outcome.principal.atomic), outcome.principal.decimals);
  return `${amount} ${outcome.principal.symbol}`;
}

function dateLabel(seconds: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(seconds * 1_000));
}

function metricValue(report: NetworkOverviewReport, kind: "outcomes" | "volume" | "solvers" | "excluded") {
  if (kind === "outcomes") return String(report.metrics.totals.confirmedOutcomes);
  if (kind === "volume") return usd(report.metrics.totals.verifiedVolumeUsdE8);
  if (kind === "solvers") return String(report.metrics.solvers.length);
  return String(Object.values(report.exclusions).reduce((total, count) => total + count, 0));
}

function OverviewMetrics({ report }: { report: NetworkOverviewReport }) {
  const valued = report.metrics.totals.valuedOutcomes;
  const confirmed = report.metrics.totals.confirmedOutcomes;
  const metrics = [
    ["Confirmed outcomes", metricValue(report, "outcomes"), "Winning programs with attributed receipts"],
    ["Verified outcome volume", metricValue(report, "volume"), `${valued} / ${confirmed} valued outcomes`],
    ["Winning solvers", metricValue(report, "solvers"), "Volume attributed only after confirmation"],
    ["Excluded records", metricValue(report, "excluded"), "Incomplete evidence is never counted"],
  ];
  return <dl className={styles.metrics}>{metrics.map(([label, value, detail]) => <div key={label}>
    <dt>{label}</dt><dd><strong>{value}</strong><small>{detail}</small></dd>
  </div>)}</dl>;
}

function OutcomeLedger({ outcomes }: { outcomes: PublicOutcomeV1[] }) {
  if (!outcomes.length) return <div className={styles.empty}>
    <Route aria-hidden="true" /><h2>No confirmed outcomes in this window</h2>
    <p>A winning program appears here only after its wallet transaction and signed outcome are independently attributed.</p>
    <Link className="button button--primary" href="/intents/new">Create an intent</Link>
  </div>;
  return <div className={styles.ledgerWrap}><table className={styles.ledger}>
    <caption className="sr-only">Confirmed Cobia outcomes with their principal, solver, and public proof</caption>
    <thead><tr><th scope="col">Outcome</th><th scope="col">Principal</th>
      <th scope="col">Solver</th><th scope="col">Proof</th></tr></thead>
    <tbody>{outcomes.map((outcome) => <tr key={outcome.submissionId}>
      <th data-label="Outcome" scope="row"><time dateTime={new Date(outcome.confirmedAtSec * 1_000).toISOString()}>
        {dateLabel(outcome.confirmedAtSec)}</time><small> · {outcome.ownerLabel}</small>
        <strong>{outcome.resultLabel}</strong><span>{outcome.intentClass.replaceAll("-", " ")}</span></th>
      <td data-label="Principal"><strong className={styles.mono}>{principal(outcome)}</strong>
        <span>{outcome.volumeUsdE8 === null ? "Unvalued" : usd(outcome.volumeUsdE8)}</span></td>
      <td data-label="Solver"><Link href={`/solvers/${outcome.solverId}`}>
        {outcome.solverId}<ArrowRight aria-hidden="true" size={14} /></Link></td>
      <td data-label="Proof"><div className={styles.proofLinks}>
        <Link href={`/programs/${outcome.submissionId}`}>Program</Link>
        <a aria-label={`Transaction for ${outcome.resultLabel} (opens in new tab)`}
          href={`https://web3.okx.com/explorer/x-layer/evm/tx/${outcome.transactionHash}`}
          rel="noreferrer" target="_blank">Transaction <ArrowUpRight aria-hidden="true" size={13} /></a>
      </div></td>
    </tr>)}</tbody>
  </table></div>;
}

function SolverTable({ report, solvers }: {
  report: NetworkOverviewReport;
  solvers: NetworkSolverEvidence[];
}) {
  if (!report.metrics.solvers.length) return null;
  return <section className={styles.section} aria-labelledby="network-solvers">
    <header><div><h2 id="network-solvers">Compare solvers by verified results.</h2>
      <p>Review confirmed volume, winning outcomes, and verifier acceptance before choosing who competes for you.</p></div>
      <Link href="/solvers">Open solver directory <ArrowRight aria-hidden="true" size={15} /></Link></header>
    <div className={styles.solverRows}>{report.metrics.solvers.map((metric) => {
      const profile = solvers.find(({ id }) => id === metric.solverId);
      const accepted = profile?.stats.accepted ?? 0;
      const resolved = accepted + (profile?.stats.rejected ?? 0);
      return <article key={metric.solverId}>
        <div><strong>{profile?.displayName ?? metric.solverId}</strong><small>{metric.solverId}</small></div>
        <div><span>Verified volume</span><strong>{usd(metric.verifiedVolumeUsdE8)}</strong></div>
        <div><span>Confirmed outcomes</span><strong>{metric.confirmedOutcomes}</strong></div>
        <div><span>Verifier acceptance</span><strong>{accepted} / {resolved} resolved revisions</strong></div>
        <Link href={`/solvers/${metric.solverId}`}>
          View solver <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </article>;
    })}</div>
  </section>;
}

export function NetworkOverview({ report, solvers }: {
  report: NetworkOverviewReport | null;
  solvers: NetworkSolverEvidence[];
}) {
  return <main className={styles.page} id="main-content">
    <section className={styles.hero}>
      <div><h1>See exactly what happened <em>onchain.</em></h1>
        <p>Trace each confirmed outcome from the winning solver program to the transaction your wallet approved.</p></div>
      <ol aria-label="How an intent becomes confirmed public proof">
        {["Intent signed", "Solvers compete", "Verifier checks", "Wallet approves", "Receipt confirms"]
          .map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span><strong>{step}</strong></li>)}
      </ol>
    </section>
    {!report ? <section className={styles.unavailable}><CircleAlert aria-hidden="true" />
      <div><h2>Network evidence unavailable</h2><p>The verifier-derived projection could not be read. Cobia is not substituting zero totals or sample activity.</p></div>
    </section> : <>
      <OverviewMetrics report={report} />
      <section className={styles.section} aria-labelledby="confirmed-outcomes">
        <header><div><h2 id="confirmed-outcomes">Inspect confirmed outcomes.</h2></div>
          <p>Principal is counted once. Proposals, rehearsals, approvals, fees, and internal program legs are excluded.</p></header>
        <OutcomeLedger outcomes={report.outcomes} />
      </section>
      <SolverTable report={report} solvers={solvers} />
    </>}
  </main>;
}
