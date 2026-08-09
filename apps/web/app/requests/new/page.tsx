import { LockKeyhole, Scale, Waypoints } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PolicyForm } from "@/components/request/PolicyForm";

const stages = [
  { icon: Waypoints, label: "Solvers quote privately" },
  { icon: Scale, label: "Cobia verifies deterministically" },
  { icon: LockKeyhole, label: "You pay only after choosing" },
] as const;

export default function NewRequestPage() {
  return (
    <>
      <AppHeader />
      <main className="request-page">
        <section className="request-page__intro">
          <p className="eyebrow">New allocation request</p>
          <h1>Set the bounds.<br />Let solvers compete.</h1>
          <p className="request-page__lede">
            Ask for net yield without choosing a protocol. Every executable field is recomputed before a route can win.
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
            <div><p className="eyebrow">Intent</p><h2 id="request-form-title">Find a USDG route</h2></div>
            <span className="asset-badge"><i>$</i> USDG · X Layer</span>
          </div>
          <PolicyForm />
        </section>
      </main>
    </>
  );
}
