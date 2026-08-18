import { ArrowRight, CheckCircle2, Clock3, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { RotatingIntentPrompt } from "./RotatingIntentPrompt";

const receipt = [
  ["Network", "X Layer"],
  ["Competition", "5 minutes"],
  ["Signer", "Your wallet"],
  ["Execution", "Exact verified calls"],
] as const;

export function GeneralIntentHero() {
  return (
    <section className="general-hero" aria-labelledby="home-title">
      <div className="general-hero__copy">
        <h1 id="home-title">What should happen onchain?</h1>
        <p>
          Describe an outcome. Cobia turns your chosen limits into a signed policy,
          lets solvers compete, and independently verifies every proposed program.
        </p>
        <div className="general-hero__actions">
          <Link className="button button--primary" href="/intents/new">
            Create an intent <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="text-link" href="/discover">Explore challenges</Link>
        </div>
        <p className="general-hero__note">
          Solvers may submit, revise, or abstain. Only your wallet can approve a verified program.
        </p>
      </div>

      <article className="intent-composer-preview" aria-label="Intent policy preview">
        <RotatingIntentPrompt />
        <div className="intent-composer-preview__receipt">
          <header>
            <span><FileCheck2 aria-hidden="true" size={18} /> Policy receipt</span>
            <strong><CheckCircle2 aria-hidden="true" size={15} /> Review before signing</strong>
          </header>
          <dl>
            {receipt.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </div>
        <footer><Clock3 aria-hidden="true" size={15} /> Example only · no quote or authorization</footer>
      </article>
    </section>
  );
}
