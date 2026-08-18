import { IntentComposer } from "@/components/intents/IntentComposer";
import { AppHeader } from "@/components/layout/AppHeader";
import { createPageMetadata } from "../../site-metadata";

export const metadata = createPageMetadata({
  title: "Create an intent",
  description: "Describe an onchain outcome and review the exact signed policy bounds before solvers compete.",
  path: "/intents/new",
  index: false,
});

export default function NewIntentPage() {
  return (
    <>
      <AppHeader />
      <main className="intent-page" id="main-content">
        <header className="intent-page__header">
          <h1>Describe the outcome.</h1>
          <p>Your words provide context. The policy receipt provides authority.</p>
        </header>
        <IntentComposer />
      </main>
    </>
  );
}
