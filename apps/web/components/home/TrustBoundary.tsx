import { ArrowRight, Code2, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";

const stages = [
  ["Solvers search", "Competing AI solvers explore different ways to reach your outcome."],
  ["Cobia verifies", "Every call is replayed against your limits and fresh X Layer state."],
  ["You approve", "Review the verified transaction in your wallet and make the final decision."],
] as const;

export function TrustBoundary() {
  return (
    <>
      <section className="trust-section" aria-labelledby="trust-title">
        <header>
          <ShieldCheck aria-hidden="true" size={24} />
          <h2 id="trust-title">AI can explore. It cannot approve.</h2>
          <p>Cobia separates finding a route from permission to use your wallet.</p>
        </header>
        <ol>
          {stages.map(([title, description], index) => (
            <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>
          ))}
        </ol>
        <div className="trust-section__limits">
          <article><Code2 aria-hidden="true" size={20} /><strong>What AI can do</strong><p>Research routes, write transaction plans, and test them in an isolated rehearsal.</p></article>
          <article><KeyRound aria-hidden="true" size={20} /><strong>What AI cannot do</strong><p>Access your private key, control your wallet, or send a production transaction.</p></article>
        </div>
      </section>
      <section className="home-final">
        <div><h2>Give solvers an outcome, not your keys.</h2><p>Set the target and limits. Cobia brings back a verified plan for your review.</p></div>
        <Link className="button button--primary" href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={17} /></Link>
      </section>
    </>
  );
}
