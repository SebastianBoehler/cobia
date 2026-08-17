import { AppHeader } from "@/components/layout/AppHeader";
import { PolicyForm } from "@/components/request/PolicyForm";
import { createPageMetadata } from "../../site-metadata";

export const metadata = createPageMetadata({
  title: "Create a DeFi Intent",
  description: "Set your outcome and hard bounds, then compare verified X Layer routes proposed by competing solvers.",
  path: "/requests/new",
});

export default function NewRequestPage() {
  return (
    <>
      <AppHeader />
      <main className="request-page" id="main-content">
        <section className="request-page__workspace" aria-labelledby="intent-workspace-title">
          <div className="intent-workspace">
            <header className="intent-workspace__header">
              <h1 id="intent-workspace-title">New intent</h1>
              <p>Set the outcome and hard bounds. Solvers compete; Cobia verifies.</p>
            </header>
            <PolicyForm />
          </div>
        </section>
        <aside className="request-page__support" aria-labelledby="intent-support-title">
          <div className="intent-support">
            <h2 id="intent-support-title">From intent to verified execution.</h2>
            <p>
              Describe the result. Cobia compares X Layer routes and rejects anything outside your
              signed rules.
            </p>
            <ol className="intent-support__steps">
              <li>
                <strong>Set the outcome</strong>
                <span>Choose what you send, what you want back, and the bounds that matter.</span>
              </li>
              <li>
                <strong>Compare verified routes</strong>
                <span>See the enforceable minimum separately from the forecast result.</span>
              </li>
              <li>
                <strong>Stay in control</strong>
                <span>Your wallet confirms every mainnet transaction. Cobia never holds your funds.</span>
              </li>
            </ol>
          </div>
        </aside>
      </main>
    </>
  );
}
