import { ArrowRight, BadgeDollarSign, Code2, ShieldCheck, Waypoints } from "lucide-react";
import Link from "next/link";

const domains = [
  {
    icon: BadgeDollarSign,
    title: "X Layer execution",
    description: "Aave supply plus Curve and Uniswap swaps with explicit outcome limits.",
    status: "Live",
    live: true,
  },
  {
    icon: Waypoints,
    title: "Open solver exchange",
    description: "Signed solver runs, revisions, abstentions, and verifier-owned histories remain inspectable.",
    status: "Live",
    live: true,
  },
  {
    icon: Code2,
    title: "Independent fork replay",
    description: "Cobia reproduces exact calls and outcomes on pinned state before wallet review.",
    status: "Verified",
    live: true,
  },
  {
    icon: ShieldCheck,
    title: "Public outcome evidence",
    description: "Accepted plans resolve to programs, receipts, asset deltas, and X Layer transactions.",
    status: "Public",
    live: true,
  },
] as const;

export function DomainCapabilityGrid() {
  return (
    <section className="domain-section" aria-labelledby="domain-title">
      <header className="section-heading-row">
        <div><h2 id="domain-title">One safety model. Four live proof surfaces.</h2></div>
        <p>AI solvers can search broadly. Cobia keeps execution exact by separating proposals, independent verification, and owner approval.</p>
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
      <Link className="inline-action" href="/solvers">Meet the solvers <ArrowRight aria-hidden="true" size={16} /></Link>
    </section>
  );
}
