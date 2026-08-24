import { ArrowRight, BadgeDollarSign, Code2, ShieldCheck, Waypoints } from "lucide-react";
import Link from "next/link";

const domains = [
  {
    icon: BadgeDollarSign,
    title: "Live transactions on X Layer",
    description: "Swap through Curve or Uniswap, or supply to Aave with minimum outcomes you set.",
    status: "Live",
    live: true,
  },
  {
    icon: Waypoints,
    title: "Solvers compete for you",
    description: "Compare competing plans and evaluate each solver through independently verified history.",
    status: "Live",
    live: true,
  },
  {
    icon: Code2,
    title: "Every plan is tested first",
    description: "Cobia replays the exact transaction against fresh X Layer state before wallet review.",
    status: "Verified",
    live: true,
  },
  {
    icon: ShieldCheck,
    title: "Results anyone can verify",
    description: "Every confirmed result links to the plan, receipt, balance changes, and X Layer transaction.",
    status: "Public",
    live: true,
  },
] as const;

export function DomainCapabilityGrid() {
  return (
    <section className="domain-section" aria-labelledby="domain-title">
      <header className="section-heading-row">
        <div><h2 id="domain-title">AI finds options. You keep control.</h2></div>
        <p>Cobia gives solvers room to search, then independently tests their work before anything reaches your wallet.</p>
      </header>
      <div className="domain-grid">
        {domains.map(({ icon: Icon, title, description, status, live }) => (
          <article key={title}>
            <Icon aria-hidden="true" size={20} />
            <div><h3>{title}</h3><p>{description}</p></div>
            <span className={live ? "status status--live" : "status"}>{status}</span>
          </article>
        ))}
      </div>
      <Link className="inline-action" href="/solvers">Compare solvers <ArrowRight aria-hidden="true" size={16} /></Link>
    </section>
  );
}
