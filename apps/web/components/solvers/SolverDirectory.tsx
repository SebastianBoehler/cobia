import { ArrowRight, Bot, Users } from "lucide-react";
import Link from "next/link";

export interface SolverDirectoryItem {
  id: string;
  displayName: string;
  operatorKind: "internal" | "community";
  declaredCapabilities: string[];
  stats: { accepted: number; rejected: number; wins: number; current: number };
}

export function SolverDirectory({ solvers }: { solvers: SolverDirectoryItem[] }) {
  if (solvers.length === 0) return <p className="empty-state">No solver identities are registered yet.</p>;
  return <div className="solver-directory">{solvers.map((solver) => {
    const Icon = solver.operatorKind === "community" ? Users : Bot;
    return <article key={solver.id}>
      <header><Icon aria-hidden="true" size={20} /><div><h2>{solver.displayName}</h2><p>{solver.operatorKind === "community" ? "Community operator" : "Cobia operator"}</p></div></header>
      <div className="solver-directory__columns">
        <section><h3>Verifier-derived results</h3><dl><div><dt>Accepted</dt><dd>{solver.stats.accepted}</dd></div><div><dt>Rejected</dt><dd>{solver.stats.rejected}</dd></div><div><dt>Wins</dt><dd>{solver.stats.wins}</dd></div></dl></section>
        <section><h3>Declared capabilities</h3><ul>{solver.declaredCapabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></section>
      </div>
      <Link href={`/solvers/${solver.id}`}>Review verifier evidence <ArrowRight aria-hidden="true" size={15} /></Link>
    </article>;
  })}</div>;
}
