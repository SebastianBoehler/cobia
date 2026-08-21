import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LandingPromptBar } from "./LandingPromptBar";
import { RotatingIntentPrompt } from "./RotatingIntentPrompt";

export function GeneralIntentHero() {
  return (
    <section className="general-hero" aria-labelledby="home-title">
      <div className="general-hero__copy">
        <h1 id="home-title">State the outcome. Keep the keys.</h1>
        <p>
          Describe what should happen onchain. Cobia turns your limits into a signed
          policy and independently verifies exact calls before your wallet approves them.
        </p>
        <div className="general-hero__actions">
          <Link className="button button--primary" href="/intents/new">
            Create an intent <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="text-link" href="/discover">Explore challenges</Link>
        </div>
        <p className="general-hero__note">
          AI proposes. Cobia verifies. Your wallet decides.
        </p>
      </div>

      <article className="intent-composer-preview" aria-label="Try an intent prompt">
        <RotatingIntentPrompt />
        <LandingPromptBar />
      </article>
    </section>
  );
}
