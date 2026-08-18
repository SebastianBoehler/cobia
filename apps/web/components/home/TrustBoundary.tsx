import { ArrowRight, Code2, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";

const stages = [
  ["Solvers search", "Write and test programs against a pinned disposable fork."],
  ["Cobia verifies", "Reproduce the exact program and check policy, targets, balances, and freshness."],
  ["You approve", "Review and sign the independently verified calls in your wallet."],
] as const;

export function TrustBoundary() {
  return (
    <>
      <section className="trust-section" aria-labelledby="trust-title">
        <header>
          <ShieldCheck aria-hidden="true" size={24} />
          <h2 id="trust-title">Creative search. Conservative execution.</h2>
          <p>Agent-authored and independently verified are two different claims.</p>
        </header>
        <ol>
          {stages.map(([title, description], index) => (
            <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>
          ))}
        </ol>
        <div className="trust-section__limits">
          <article><Code2 aria-hidden="true" size={20} /><strong>Inside the sandbox</strong><p>Read pinned public state. Write code. Broadcast only to a disposable fork.</p></article>
          <article><KeyRound aria-hidden="true" size={20} /><strong>Outside the sandbox</strong><p>The agent never receives your private key, wallet handle, or production send method.</p></article>
        </div>
      </section>
      <section className="home-final">
        <div><h2>Give solvers an outcome, not your keys.</h2><p>The signed policy is the boundary. The verified program is the proposal.</p></div>
        <Link className="button button--primary" href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={17} /></Link>
      </section>
    </>
  );
}
