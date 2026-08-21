import { DiscoverView } from "@/components/discover/DiscoverView";
import { AppHeader } from "@/components/layout/AppHeader";
import { getChallengeRepository, getIntentRepository, getSolverSubmissionRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import { readCachedCommerceDiscoveryV1 } from "@/lib/runtime/commerce";
import { createPageMetadata } from "../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Discover",
  description: "Explore standing challenges, current custom intents, and historical solver discoveries.",
  path: "/discover",
});

export default async function DiscoverPage() {
  const observedAtSec = currentUnixSeconds();
  const [challengeResult, intentResult, historyResult, commerceResult] = await Promise.allSettled([
    getChallengeRepository().listDiscover(observedAtSec),
    getIntentRepository().listDiscover(observedAtSec),
    getSolverSubmissionRepository().listHistory(observedAtSec),
    readCachedCommerceDiscoveryV1(20),
  ]);
  const challengeRows = challengeResult.status === "fulfilled" ? challengeResult.value : [];
  const intentRows = intentResult.status === "fulfilled" ? intentResult.value : [];
  const history = historyResult.status === "fulfilled" ? historyResult.value : [];
  const commerce = commerceResult.status === "fulfilled"
    ? commerceResult.value
    : { offers: [], sourceErrors: [] };
  const sectionErrors = {
    ...(challengeResult.status === "rejected" && { challenges: "Standing challenges are temporarily unavailable." }),
    ...(intentResult.status === "rejected" && { intents: "Custom intents are temporarily unavailable." }),
    ...(historyResult.status === "rejected" && { history: "Past discoveries are temporarily unavailable." }),
    ...(commerceResult.status === "rejected" && { commerce: "Paid-resource discovery is temporarily unavailable." }),
  };
  const challenges = challengeRows.map((row) => ({
    id: row.id, title: row.title, goal: row.displayGoal, availability: row.availability,
  }));
  const intents = intentRows.map((row) => ({
    id: row.id, goal: row.displayGoal, state: row.state, closesAt: row.competitionClosesAt.toISOString(),
  }));
  return (
    <>
      <AppHeader />
      <main className="directory-page directory-page--discover" id="main-content">
        <header className="directory-page__header"><h1>Discover</h1><p>Start from supported standing challenges, or review live intent competitions and verified solver history.</p></header>
        <DiscoverView challenges={challenges} intents={intents} history={history}
          commerceOffers={commerce.offers} observedAtSec={observedAtSec}
          commerceSourceErrors={commerce.sourceErrors} sectionErrors={sectionErrors} />
      </main>
    </>
  );
}
