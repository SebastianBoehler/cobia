import { ArrowRight, BadgeDollarSign, Boxes, CreditCard, Landmark } from "lucide-react";
import Link from "next/link";

const domains = [
  {
    icon: BadgeDollarSign,
    title: "X Layer protocol intents",
    description: "Aave supply plus Curve and Uniswap exact-input swaps with semantic bounds.",
    status: "Supported",
    live: true,
  },
  {
    icon: CreditCard,
    title: "Shopping and x402",
    description: "Registered offers bind merchant and product details to bounded payment and receipt evidence.",
    status: "Supported · offer required",
    live: true,
  },
  {
    icon: Boxes,
    title: "Open protocol programs",
    description: "Other exact wallet calls can compete when code, approvals, outcomes, and fork replay all verify.",
    status: "Verified program lane",
    live: true,
  },
  {
    icon: Landmark,
    title: "Registered RWA acquisition",
    description: "Issuer-sourced token identities, eligibility attestation, exact-call routes, and verified receipt-token increases.",
    status: "Supported · eligibility required",
    live: true,
  },
  {
    icon: Landmark,
    title: "Recurring actions",
    description: "Subscriptions still need cancellation, renewal, and recurring-authority semantics.",
    status: "Additional semantics needed",
    live: false,
  },
] as const;

export function DomainCapabilityGrid() {
  return (
    <section className="domain-section" aria-labelledby="domain-title">
      <header className="section-heading-row">
        <div><h2 id="domain-title">One intent model, explicit capabilities.</h2></div>
        <p>Known workflows use semantic adapters. Other protocols can use the exact wallet-call lane when every call and outcome reproduces independently.</p>
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
