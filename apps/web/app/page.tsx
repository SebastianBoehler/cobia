import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  CirclePlus,
  Clock3,
  Code2,
  KeyRound,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { createPageMetadata } from "./site-metadata";

export const metadata = createPageMetadata({
  title: "Verified DeFi Routes on X Layer",
  description: "State the wallet outcome you want. Solvers search, Cobia independently verifies, and you decide whether to execute.",
  path: "/",
});

const proofPoints = [
  { icon: Blocks, label: "Fresh-fork simulation" },
  { icon: ShieldCheck, label: "Independent verification" },
  { icon: WalletCards, label: "Wallet-only signing" },
] as const;

const flow = [
  ["Solvers search", "Eligible solvers can propose a route or decline."],
  ["Cobia verifies", "The exact program must reproduce on a fresh fork."],
  ["You approve", "Your wallet reviews and signs the verified calls."],
] as const;

const productLinks = [
  { href: "/requests/new", icon: CirclePlus, title: "Create an intent", description: "Describe the wallet outcome and hard limits." },
  { href: "/portfolio", icon: WalletCards, title: "View positions", description: "Read balances and protocol positions at one block." },
  { href: "/activity", icon: Clock3, title: "Review activity", description: "Follow purchased proofs and execution receipts." },
  { href: "/markets", icon: Store, title: "Explore solver markets", description: "Compare live requests and valid proposals." },
] as const;

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="home" id="main-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <h1 id="home-title">State the outcome.<br /><span>Cobia finds the route.</span></h1>
            <p className="home-hero__intro">
              Tell Cobia what your wallet should end with and the limits it must respect. Solvers
              search, an independent verifier checks the exact program, and you decide whether to sign.
            </p>
            <div className="home-hero__actions">
              <Link className="button button--primary" href="/requests/new">
                Create an intent <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />
              </Link>
              <Link className="text-link" href="/markets">Browse solver market</Link>
            </div>
            <ul className="home-proof" aria-label="Execution guarantees">
              {proofPoints.map(({ icon: Icon, label }) => (
                <li key={label}><Icon aria-hidden="true" size={16} strokeWidth={1.8} />{label}</li>
              ))}
            </ul>
          </div>

          <article className="intent-example" aria-labelledby="example-intent-title">
            <header className="intent-example__header">
              <div><p>Example intent</p><span>X Layer · 5 minute market</span></div>
              <span className="intent-example__status">Example only</span>
            </header>
            <div className="intent-example__statement">
              <p>Maximize my final balance</p>
              <h2 id="example-intent-title">10 USDG <ArrowRight aria-hidden="true" size={22} /> USDt0</h2>
              <span>Find the highest verified outcome without crossing my minimum.</span>
            </div>
            <dl className="intent-example__bounds">
              <div><dt>You send</dt><dd>10 USDG</dd></div>
              <div><dt>Minimum outcome</dt><dd>10.04 USDt0</dd></div>
              <div><dt>Time live</dt><dd>5 minutes</dd></div>
              <div><dt>Signer</dt><dd>Your wallet</dd></div>
            </dl>
            <ol className="intent-example__flow">
              {flow.map(([title, description], index) => (
                <li key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{title}</strong><p>{description}</p></div>
                </li>
              ))}
            </ol>
            <footer><CheckCircle2 aria-hidden="true" size={15} /> Example request · not a live quote</footer>
          </article>
        </section>

        <nav className="home-product-nav" aria-label="Cobia product">
          {productLinks.map(({ href, icon: Icon, title, description }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span><strong>{title}</strong><small>{description}</small></span>
              <ArrowRight aria-hidden="true" className="home-product-nav__arrow" size={17} />
            </Link>
          ))}
        </nav>

        <section className="home-mechanism" aria-labelledby="mechanism-title">
          <header className="home-section-heading">
            <h2 id="mechanism-title">Creative route search.<br />Conservative execution.</h2>
            <p>The solver explores broadly inside a disposable blockchain lab. The verifier decides narrowly from canonical evidence.</p>
          </header>
          <div className="home-mechanism__grid">
            <article><span>01</span><h3>Publish hard bounds</h3><p>Sign the asset, amount, deadline, permitted targets, and minimum final balance—not a route chosen in advance.</p></article>
            <article><span>02</span><h3>Search in isolation</h3><p>Solvers can write code, use protocol tooling, and test compositions. They never receive your key or a production send method.</p></article>
            <article><span>03</span><h3>Execute exact calls</h3><p>Cobia replays the proposal and checks every target, approval, recipient, deadline, and balance before your wallet can sign.</p></article>
          </div>
        </section>

        <section className="agent-boundary" aria-labelledby="agent-boundary-title">
          <div className="agent-boundary__intro">
            <h2 id="agent-boundary-title">The agent can explore.<br />It cannot touch your keys.</h2>
            <p>Agent-authored means creative provenance. Independently verified means eligible for your review. They are never the same claim.</p>
          </div>
          <div className="agent-boundary__cards">
            <article>
              <Code2 aria-hidden="true" size={22} strokeWidth={1.8} />
              <h3>Inside the sandbox</h3>
              <ul><li>Write and run route-search code</li><li>Read pinned public chain state</li><li>Broadcast only to a disposable fork</li></ul>
            </article>
            <article>
              <KeyRound aria-hidden="true" size={22} strokeWidth={1.8} />
              <h3>Outside the sandbox</h3>
              <ul><li>The agent never receives your private key</li><li>It cannot call a production send RPC</li><li>It cannot approve its own proposal</li></ul>
            </article>
          </div>
        </section>

        <section className="home-cta">
          <h2>What should your wallet end with?</h2>
          <Link className="button button--paper" href="/requests/new">Create an intent <ArrowRight aria-hidden="true" size={17} /></Link>
        </section>
      </main>
    </>
  );
}
