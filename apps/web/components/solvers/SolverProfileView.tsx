import { ArrowRight, Bot, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import type { SolverPerformanceReportV1 } from "@cobia/domain";

export interface SolverProfileSubmission {
  id: string;
  revision: number;
  state: string;
  createdAt: string;
}

function chainLabel(chainId: number): string {
  if (chainId === 196) return "X Layer";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

function rateLabel(rateBps: number | null): string {
  return rateBps === null ? "Unavailable" : `${(rateBps / 100).toFixed(2)}%`;
}

function Metric({ label, metric, denominatorLabel }: {
  label: string;
  metric: SolverPerformanceReportV1["rates"][keyof SolverPerformanceReportV1["rates"]];
  denominatorLabel: string;
}) {
  return <div className="solver-evidence__metric">
    <small>{label}</small><strong>{rateLabel(metric.rateBps)}</strong>
    <span>{metric.numerator} / {metric.denominator} {denominatorLabel}</span>
  </div>;
}

function QualityMetric({ label, valueBps, sampleSize, sampleLabel }: {
  label: string;
  valueBps: number | null;
  sampleSize: number;
  sampleLabel: string;
}) {
  const sample = `${sampleSize} comparable ${sampleLabel}${sampleSize === 1 ? "" : "s"}`;
  return <div className="solver-evidence__metric">
    <small>{label}</small>
    <strong>{valueBps === null ? "Unavailable" : `${(valueBps / 100).toFixed(2)}%`}</strong>
    <span>{sample}</span>
  </div>;
}

function LatencyMetric({ seconds, sampleSize }: { seconds: number | null; sampleSize: number }) {
  return <div className="solver-evidence__metric">
    <small>Median first submission</small>
    <strong>{seconds === null ? "Unavailable" : `${seconds}s`}</strong>
    <span>{sampleSize} timed intent{sampleSize === 1 ? "" : "s"}</span>
  </div>;
}

export function SolverProfileView({ profile }: { profile: {
  displayName: string;
  operatorKind: "internal" | "community";
  attestationAddress: string | null;
  declaredCapabilities: string[];
  stats: { accepted: number; rejected: number; wins: number; current: number };
  performance: SolverPerformanceReportV1[];
  submissions: SolverProfileSubmission[];
} }) {
  const Icon = profile.operatorKind === "community" ? Users : Bot;
  return <div className="solver-profile">
    <section className="solver-profile__hero">
      <Icon aria-hidden="true" />
      <div><span>{profile.operatorKind === "community" ? "Community solver" : "Cobia solver"}</span><h1>{profile.displayName}</h1><p>Capability claims describe what this solver attempts. Acceptance, rejection, and wins below come only from immutable verifier-owned records.</p></div>
    </section>
    <section className="solver-profile__facts">
      <div><small>Accepted</small><strong>{profile.stats.accepted}</strong></div>
      <div><small>Rejected</small><strong>{profile.stats.rejected}</strong></div>
      <div><small>Selected wins</small><strong>{profile.stats.wins}</strong></div>
      <div><small>Current</small><strong>{profile.stats.current}</strong></div>
    </section>
    <section className="solver-profile__capabilities">
      <header><ShieldCheck aria-hidden="true" size={19} /><div><h2>Declared capabilities</h2><p>Declarations are discovery metadata, not execution authority.</p></div></header>
      <ul>{profile.declaredCapabilities.map((item) => <li key={item}>{item}</li>)}</ul>
      {profile.attestationAddress ? <p>Attestation identity <code>{profile.attestationAddress}</code></p> : null}
    </section>
    <section className="solver-evidence">
      <header className="section-heading"><div><h2>30-day verifier evidence</h2><p>Rates are segmented, denominator-backed, and never combined into an opaque score.</p></div></header>
      {profile.performance.length ? profile.performance.map((report) => <article key={`${report.segment.chainId}:${report.segment.intentClass}`}>
        <header><div><strong>{chainLabel(report.segment.chainId)} · {report.segment.intentClass}</strong><span>{report.counts.observedIntents} observed intents</span></div><small>{report.rates.win.status === "established" ? "Established sample" : `Preliminary until n=${report.establishedSampleSize}`}</small></header>
        <div className="solver-evidence__grid">
          <Metric label="Win rate" metric={report.rates.win} denominatorLabel="entered intents" />
          <Metric label="Verifier acceptance" metric={report.rates.verifierAcceptance} denominatorLabel="resolved revisions" />
          <Metric label="Execution success" metric={report.rates.executionSuccess} denominatorLabel="execution attempts" />
          <Metric label="Replay rejection" metric={report.rates.replayRejection} denominatorLabel="resolved revisions" />
          <QualityMetric label="Verified outcome margin" valueBps={report.outcomeQuality.medianVerifiedMarginBps} sampleSize={report.outcomeQuality.verifiedMarginSampleSize} sampleLabel="outcome" />
          <QualityMetric label="Revision improvement" valueBps={report.outcomeQuality.medianRevisionImprovementBps} sampleSize={report.outcomeQuality.revisionImprovementSampleSize} sampleLabel="revision" />
          <LatencyMetric seconds={report.responsiveness.medianFirstSubmissionLatencySec} sampleSize={report.responsiveness.sampleSize} />
        </div>
        <p>{report.counts.abstainedIntents} abstained · {report.counts.failedIntents} generation failures · {report.counts.successfulExecutions} successful executions</p>
      </article>) : <p className="empty-state">Insufficient verifier-owned history for a performance report.</p>}
    </section>
    <section>
      <header className="section-heading"><div><h2>Program history</h2><p>Every published revision remains independently inspectable.</p></div></header>
      {profile.submissions.length ? <div className="solver-programs">{profile.submissions.map((item) => <Link href={`/programs/${item.id}`} key={item.id}>
        <span>Revision {item.revision}</span><small>{new Date(item.createdAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</small><strong>{item.state}</strong><ArrowRight aria-hidden="true" size={15} />
      </Link>)}</div> : <p className="empty-state">This solver has not published a program yet.</p>}
    </section>
  </div>;
}
