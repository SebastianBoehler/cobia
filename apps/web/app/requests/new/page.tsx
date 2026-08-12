import { AppHeader } from "@/components/layout/AppHeader";
import { PolicyForm } from "@/components/request/PolicyForm";

export default function NewRequestPage() {
  return (
    <>
      <AppHeader />
      <main className="request-page">
        <section className="request-page__composer" aria-labelledby="request-form-title">
          <h1 id="request-form-title">Describe the outcome you want.</h1>
          <p className="request-page__lede">
            Cobia searches verified X Layer routes to reach your outcome non-custodially.
          </p>
          <PolicyForm />
        </section>
        <section className="request-page__results" aria-labelledby="route-preview-title">
          <div className="route-empty-state">
            <h2 id="route-preview-title">Your best route will appear here.</h2>
            <p>Sign an outcome and Cobia will compare only routes that pass your exact policy bounds.</p>
            <dl>
              <div><dt>On-chain bound</dt><dd>Minimum received</dd></div>
              <div><dt>Estimate</dt><dd>Expected result</dd></div>
              <div><dt>Proof</dt><dd>Simulation + verifier</dd></div>
            </dl>
          </div>
        </section>
      </main>
    </>
  );
}
