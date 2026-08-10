import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { RouteCanvas } from "@/components/brand/RouteCanvas";
import { AppHeader } from "@/components/layout/AppHeader";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main>
        <section className="home-hero">
          <div className="home-hero__copy">
            <h1>Yield routes, priced by a market.</h1>
            <p className="home-hero__intro">
              State your constraints. Independent solvers compete. Cobia verifies every proposal and you pay only the winner.
            </p>
            <div className="home-hero__actions">
              <Link className="button button--primary" href="/requests/new">
                Open quote market <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <a className="text-link" href="#mechanism">See the mechanism</a>
            </div>
            <div className="home-hero__boundary">
              <CheckCircle2 aria-hidden="true" size={17} />
              Your principal stays in your wallet until execution.
            </div>
          </div>
          <RouteCanvas />
        </section>

        <section className="mechanism" id="mechanism">
          <header className="section-heading">
            <h2>Research is private. Verification is public.</h2>
          </header>
          <ol className="mechanism__steps">
            <li><span>01</span><h3>Request</h3><p>Define principal, exposure, liquidity, freshness, and route limits.</p></li>
            <li><span>02</span><h3>Compete</h3><p>Solvers submit signed route bundles against one immutable snapshot.</p></li>
            <li><span>03</span><h3>Verify</h3><p>Code recomputes APY, checks constraints, and rejects unsafe actions.</p></li>
            <li><span>04</span><h3>Choose</h3><p>Compare sanitized quotes without exposing the winning route.</p></li>
            <li><span>05</span><h3>Pay + reveal</h3><p>Pay 0.10 stablecoin via x402. The committed bundle is revealed and rechecked.</p></li>
          </ol>
        </section>

        <section className="closing-cta">
          <h2>Set the bounds.<br />Let the market work.</h2>
          <Link className="button button--paper" href="/requests/new">
            Create request <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </main>
    </>
  );
}
