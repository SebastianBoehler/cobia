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
            <h1>One bounded Aave + Uniswap route, recomputed.</h1>
            <p className="home-hero__intro">
              Cobia captures registered Aave V3 and Uniswap V3 opportunities at one pinned X Layer block, then independently verifies one deterministic route quote.
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
            <h2>Live data in. Deterministic quote out.</h2>
          </header>
          <ol className="mechanism__steps">
            <li><span>01</span><h3>Request</h3><p>Define principal, exposure, liquidity, freshness, and route limits.</p></li>
            <li><span>02</span><h3>Capture</h3><p>Read Aave reserve/oracle state and the registered Uniswap quote at one pinned block.</p></li>
            <li><span>03</span><h3>Quote</h3><p>Build one exact direct-supply or swap-to-supply route, retaining the unallocated principal.</p></li>
            <li><span>04</span><h3>Recompute</h3><p>Recompute the signed bundle&apos;s amounts, APY, limits, and signer.</p></li>
            <li><span>05</span><h3>Pay + reveal</h3><p>Pay 0.10 stablecoin through OKX MPP to reveal the signed bundle. Principal remains unmoved.</p></li>
          </ol>
        </section>

        <section className="closing-cta">
          <h2>Set the bounds.<br />Review the quote.</h2>
          <Link className="button button--paper" href="/requests/new">
            Create request <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </main>
    </>
  );
}
