import { IntentComposer } from "@/components/intents/IntentComposer";
import { AppHeader } from "@/components/layout/AppHeader";
import { notFound } from "next/navigation";
import { challengeToIntentDraft } from "../../../lib/intents/challenge-draft";
import { getChallengeRepository } from "../../../lib/runtime/market";
import { createPageMetadata } from "../../site-metadata";

export const metadata = createPageMetadata({
  title: "Create an intent",
  description: "Describe an onchain outcome and review the exact signed policy bounds before solvers compete.",
  path: "/intents/new",
  index: false,
});

export default async function NewIntentPage({ searchParams }: {
  searchParams: Promise<{ challenge?: string | string[] }>;
}) {
  const challengeId = (await searchParams).challenge;
  const challenge = typeof challengeId === "string"
    ? await getChallengeRepository().getActive(challengeId)
    : null;
  if (challengeId !== undefined && !challenge) notFound();
  const initialDraft = challenge ? challengeToIntentDraft(challenge) : undefined;
  return (
    <>
      <AppHeader />
      <main className="intent-page" id="main-content">
        <header className="intent-page__header">
          <h1>Describe the outcome.</h1>
          <p>Start with the goal. Cobia turns it into explicit limits for you to review before anything is signed.</p>
        </header>
        <IntentComposer initialDraft={initialDraft} />
      </main>
    </>
  );
}
