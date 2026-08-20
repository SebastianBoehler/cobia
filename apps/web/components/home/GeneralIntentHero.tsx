import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LandingPromptBar } from "./LandingPromptBar";
import { RotatingIntentPrompt } from "./RotatingIntentPrompt";

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

      <article className="intent-composer-preview" aria-label="Try an intent prompt">
        <RotatingIntentPrompt />
        <LandingPromptBar />
      </article>
    </section>
  );
}
