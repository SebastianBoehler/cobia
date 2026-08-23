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
          Describe the outcome. AI solvers compete to produce the best transaction plan.
          Cobia independently replays every call against your limits before your wallet
          can approve it.
        </p>
        <div className="general-hero__actions">
          <Link className="button button--primary" href="/intents/new">
            Describe an outcome <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="text-link" href="/buildx#evidence">See mainnet proof</Link>
        </div>
        <p className="general-hero__note">
          Live on X Layer mainnet · 25+ confirmed outcomes · 3 signed solver profiles · public source
        </p>
      </div>

      <article className="intent-composer-preview" aria-label="Try an intent prompt">
        <RotatingIntentPrompt />
        <LandingPromptBar />
      </article>
    </section>
  );
}
