import { ArrowRight, CircleDot, Clock3, History, ShieldCheck } from "lucide-react";
import Link from "next/link";

export interface CompetitionSubmission {
  id: string;
  solverId: string;
  revision: number;
  state: string;
  validUntil: string;
  objective: { atomic: string; direction: "maximize" | "minimize" } | null;
}

function stateLabel(value: string) {
  const words = value.replaceAll("-", " ");
  return words[0]?.toUpperCase() + words.slice(1);
}

function SubmissionRow({ item, current }: { item: CompetitionSubmission; current: boolean }) {
  return <article className="competition-row">
    <div className="competition-row__identity">
      <span className={`status ${current ? "status--live" : ""}`}>{stateLabel(item.state)}</span>
      <h3>{item.solverId}</h3>
      <p>Revision {item.revision} · valid until {new Date(item.validUntil).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      })} UTC</p>
    </div>
    <div className="competition-row__result">
      <small>Verified objective</small>
      <strong>{item.objective ? `${item.objective.atomic} atomic units` : "Policy satisfied"}</strong>
    </div>
    <Link href={`/programs/${item.id}`}>Inspect program <ArrowRight aria-hidden="true" size={15} /></Link>
  </article>;
}

export function IntentCompetitionView({ goal, closesAt, observedAtSec, current, history }: {
  goal: string;
  closesAt: string;
  observedAtSec: number;
  current: CompetitionSubmission[];
  history: CompetitionSubmission[];
}) {
  const live = Date.parse(closesAt) > observedAtSec * 1_000;
  const emptyTitle = live ? "Waiting for solver submissions" : "Closed without a verified program";
  return <div className="intent-competition">
    <section className="intent-competition__summary">
      <ShieldCheck aria-hidden="true" size={24} />
      <div>
        <span className={`intent-competition__status ${live ? "intent-competition__status--live" : ""}`}>
          <CircleDot aria-hidden="true" size={14} />{live ? "Live · accepting proposals" : "Competition closed"}
        </span>
        <h1>{goal}</h1>
        <p>{live
          ? "Independent solvers are working from the signed policy and may publish improved revisions until the deadline."
          : "The proposal window has ended. Any submitted revisions remain available as auditable evidence below."}</p>
      </div>
      <div className="intent-competition__deadline"><Clock3 aria-hidden="true" size={15} /><span>{live ? "Proposal deadline" : "Closed"}</span><strong>{new Date(closesAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</strong></div>
    </section>

    <section aria-labelledby="current-programs">
      <header className="section-heading"><div><h2 id="current-programs">Current programs</h2><p>Newest live revision from each solver, ranked by verifier-owned objective evidence.</p></div><span>{current.length}</span></header>
      {current.length ? <div className="competition-list">{current.map((item) => <SubmissionRow current item={item} key={item.id} />)}</div>
        : <div className={`competition-waiting ${live ? "competition-waiting--live" : ""}`} role="status">
          <CircleDot aria-hidden="true" size={20} />
          <div><strong>{emptyTitle}</strong><p>{live
            ? "New solver jobs can still be submitted before the deadline. This page will show independently verified programs as they arrive."
            : "No independently verified solver program arrived before this competition closed."}</p></div>
        </div>}
    </section>

    <section aria-labelledby="revision-history">
      <header className="section-heading"><div><h2 id="revision-history">Revision history</h2><p>Superseded, rejected, expired, and executed programs remain auditable.</p></div><History aria-hidden="true" size={20} /></header>
      {history.length ? <div className="competition-list competition-list--history">{history.map((item) => <SubmissionRow current={false} item={item} key={item.id} />)}</div>
        : <p className="empty-state">No earlier revisions yet.</p>}
    </section>
  </div>;
}
