import { notFound } from "next/navigation";
import { OpenIntentSnapshotV1Schema } from "@cobia/domain";
import { IntentCompetitionView } from "@/components/intents/IntentCompetitionView";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  getIntentRepository, getOpenIntentSnapshotRepository, getSolverSubmissionRepository,
} from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import { createPageMetadata } from "../../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Intent competition",
  description: "Compare current verified solver revisions and inspect their immutable history.",
  path: "/intents",
});

export default async function IntentCompetitionPage({ params }: PageProps<"/intents/[intentId]">) {
  const { intentId } = await params;
  const intent = await getIntentRepository().get(intentId);
  if (!intent) notFound();
  const observedAtSec = currentUnixSeconds();
  const [rows, storedSnapshot] = await Promise.all([
    getSolverSubmissionRepository().listForIntent(intentId, observedAtSec),
    getOpenIntentSnapshotRepository().get(intentId),
  ]);
  if (!storedSnapshot) throw new Error("Published open intent snapshot is unavailable");
  const snapshot = OpenIntentSnapshotV1Schema.parse(storedSnapshot.snapshot);
  const map = (item: (typeof rows.current)[number]) => ({
    id: item.id, solverId: item.solverId, revision: item.revision,
    state: item.presentationState, validUntil: item.validUntil.toISOString(),
    objective: item.objective,
  });
  return <>
    <AppHeader />
    <main className="directory-page" id="main-content">
      <IntentCompetitionView
        goal={intent.displayGoal}
        closesAt={intent.competitionClosesAt.toISOString()}
        observedAtSec={observedAtSec}
        current={rows.current.map(map)}
        history={rows.history.map(map)}
        tokenEvidence={snapshot.tokenEvidence}
      />
    </main>
  </>;
}
