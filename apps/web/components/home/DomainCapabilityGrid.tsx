import { ArrowRight, BadgeDollarSign, Boxes, CreditCard, Landmark } from "lucide-react";
import Link from "next/link";

const domains = [
  {
    icon: BadgeDollarSign,
    title: "Investments",
    description: "Exact-input swaps and Aave supply with verifier-owned bounds.",
    status: "Live capability",
    live: true,
  },
  {
    icon: CreditCard,
    title: "Shopping and x402",
    description: "Bounded payments and purchase receipts need a commerce capability.",
    status: "Requires capability",
    live: false,
  },
  {
    icon: Boxes,
    title: "Subscriptions",
    description: "Recurring actions need scoped authorization and cancellation rules.",
    status: "Requires capability",
    live: false,
  },
  {
    icon: Landmark,
    title: "Tokenized real-world assets",
    description: "Issuer, oracle, custody, and redemption semantics must be verified first.",
    status: "Requires capability",
    live: false,
  },
] as const;

export function DomainCapabilityGrid() {
  return (
    <section className="domain-section" aria-labelledby="domain-title">
      <header className="section-heading-row">
        <div><h2 id="domain-title">One intent model, explicit capabilities.</h2></div>
        <p>Cobia is protocol-neutral by design. A domain becomes executable only after its semantics exist in the trusted verifier manifest.</p>
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
