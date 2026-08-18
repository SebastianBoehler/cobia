import { DiscoverView } from "@/components/discover/DiscoverView";
import { AppHeader } from "@/components/layout/AppHeader";
import { getChallengeRepository, getIntentRepository, getSolverSubmissionRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import { createPageMetadata } from "../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Discover",
  description: "Explore standing challenges, current custom intents, and historical solver discoveries.",
  path: "/discover",
});

export default async function DiscoverPage() {
  const observedAtSec = currentUnixSeconds();
  const [challengeRows, intentRows, history] = await Promise.all([
    getChallengeRepository().listDiscover(observedAtSec),
    getIntentRepository().listDiscover(observedAtSec),
    getSolverSubmissionRepository().listHistory(observedAtSec),
  ]);
  const challenges = challengeRows.map((row) => ({
    id: row.id, title: row.title, goal: row.displayGoal, availability: row.availability,
  }));
  const intents = intentRows.map((row) => ({
    id: row.id, goal: row.displayGoal, state: row.state, closesAt: row.competitionClosesAt.toISOString(),
  }));
  return (
    <>
      <AppHeader />
      <main className="directory-page" id="main-content">
        <header className="directory-page__header"><h1>Discover</h1><p>Persistent challenges, wallet-specific competitions, and past solver programs—kept visibly separate.</p></header>
        <DiscoverView challenges={challenges} intents={intents} history={history} />
      </main>
    </>
  );
}
