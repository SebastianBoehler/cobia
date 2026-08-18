import { ArrowRight, Bot, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

export interface SolverProfileSubmission {
  id: string;
  revision: number;
  state: string;
  createdAt: string;
}

export function SolverProfileView({ profile }: { profile: {
  displayName: string;
  operatorKind: "internal" | "community";
  attestationAddress: string | null;
  declaredCapabilities: string[];
  stats: { accepted: number; rejected: number; wins: number; current: number };
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
    <section>
      <header className="section-heading"><div><h2>Program history</h2><p>Every published revision remains independently inspectable.</p></div></header>
      {profile.submissions.length ? <div className="solver-programs">{profile.submissions.map((item) => <Link href={`/programs/${item.id}`} key={item.id}>
        <span>Revision {item.revision}</span><small>{new Date(item.createdAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}</small><strong>{item.state}</strong><ArrowRight aria-hidden="true" size={15} />
      </Link>)}</div> : <p className="empty-state">This solver has not published a program yet.</p>}
    </section>
  </div>;
}
