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
            <h1>Bounded solvers. One verification boundary.</h1>
            <p className="home-hero__intro">
              Cobia runs deterministic and bounded agentic solvers over one pinned X Layer snapshot, then independently verifies every published route.
            </p>
            <div className="home-hero__actions">
              <Link className="button button--primary" href="/markets">
                Explore Earn markets <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <a className="text-link" href="#mechanism">See the mechanism</a>
            </div>
            <div className="home-hero__boundary">
              <CheckCircle2 aria-hidden="true" size={17} />
              Principal remains unmoved. Purchase reveals the plan; execution remains product-unwired.
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
          </ol>
        </section>

        <section className="closing-cta">
          <h2>Set the bounds.<br />Compare the routes.</h2>
          <Link className="button button--paper" href="/requests/new">
            Create request <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </main>
    </>
  );
}
