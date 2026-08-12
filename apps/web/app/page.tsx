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
            <h1>Your intent in. The best verified route out.</h1>
            <p className="home-hero__intro">
              Ask for the best stablecoin outcome. Cobia searches registered X Layer DeFi routes, simulates each candidate, and verifies token minimums before your wallet can execute it.
            </p>
            <div className="home-hero__actions">
              <Link className="button button--primary" href="/requests/new">
                Create an intent <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <Link className="text-link" href="/markets">Explore verified routes</Link>
            </div>
            <div className="home-hero__boundary">
              <CheckCircle2 aria-hidden="true" size={17} />
              Self-custodial by design: solvers propose, Cobia verifies, your wallet executes.
            </div>
          </div>
          <RouteCanvas />
        </section>

        <section className="mechanism" id="mechanism">
          <header className="section-heading">
            <h2>Live data in. Verified solver routes out.</h2>
          </header>
          <ol className="mechanism__steps">
            <li><span>01</span><h3>Request</h3><p>Define principal, exposure, liquidity, freshness, and route limits.</p></li>
            <li><span>02</span><h3>Capture</h3><p>Read Aave reserve/oracle state and the registered Uniswap quote at one pinned block.</p></li>
            <li><span>03</span><h3>Solve</h3><p>Let deterministic and bounded agentic solvers choose among exact direct-supply or swap-to-supply candidates.</p></li>
            <li><span>04</span><h3>Recompute</h3><p>Recompute the signed bundle&apos;s amounts, APY, limits, and signer.</p></li>
            <li><span>05</span><h3>Pay + reveal</h3><p>Pay 0.10 stablecoin through OKX MPP to reveal the signed bundle. Principal remains unmoved.</p></li>
            <li><span>06</span><h3>Execute</h3><p>Cobia rebuilds every call and wallet confirms every transaction against fresh bounds.</p></li>
          </ol>
        </section>

        <section className="closing-cta">
          <h2>Define the outcome.<br />Let solvers compete.</h2>
          <Link className="button button--paper" href="/requests/new">
            Create an intent <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </main>
    </>
  );
}
