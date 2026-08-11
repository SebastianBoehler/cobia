import { LockKeyhole, Scale, Waypoints } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PolicyForm } from "@/components/request/PolicyForm";

const stages = [
  { icon: Waypoints, label: "Pinned same-block reads" },
  { icon: Scale, label: "Aave + Uniswap route quote" },
  { icon: LockKeyhole, label: "Route authorization recomputed" },
] as const;

export default function NewRequestPage() {
  return (
    <>
      <AppHeader />
      <main className="request-page">
        <section className="request-page__intro">
          <h1>Set exact bounds.<br />Compare verified routes.</h1>
          <p className="request-page__lede">
            Cobia compares exact Aave V3 and Uniswap V3 allocations from one pinned X Layer block. Paid reveal unlocks an authorized quote; a passing fresh route can then enter guided X Layer mainnet execution with one wallet confirmation per transaction.
          </p>
          <ol className="request-stages">
            {stages.map(({ icon: Icon, label }, index) => (
              <li key={label}>
                <span className="request-stages__node"><Icon aria-hidden="true" size={17} /></span>
                <span><small>0{index + 1}</small>{label}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="request-page__workspace" aria-labelledby="request-form-title">
          <div className="workspace-heading">
            <h2 id="request-form-title">Open solver market</h2>
            <span className="asset-badge"><i>$</i> USDG / USDt0 · X Layer</span>
          </div>
          <PolicyForm />
        </section>
      </main>
    </>
  );
}
