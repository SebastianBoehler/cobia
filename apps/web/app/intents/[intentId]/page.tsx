import { notFound } from "next/navigation";
import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  OpenIntentSnapshotV1Schema,
} from "@cobia/domain";
import { IntentCompetitionView } from "@/components/intents/IntentCompetitionView";
import { IntentCompetitionRefresh } from "@/components/intents/IntentCompetitionRefresh";
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
  const composed = intent.policy.kind === "capability-composition";
  const snapshot = composed
    ? CapabilityCompositionSnapshotV1Schema.parse(storedSnapshot.snapshot)
    : OpenIntentSnapshotV1Schema.parse(storedSnapshot.snapshot);
  const compositionPolicy = composed
    ? CapabilityCompositionPolicyV1Schema.parse(intent.policy) : undefined;
  const maximumLoss = compositionPolicy?.constraints.find((item) =>
    item.kind === "maximum-conversion-loss");
  const receiptFloor = compositionPolicy?.constraints.find((item) =>
    item.kind === "minimum-registered-receipt-value");
  const map = (item: (typeof rows.current)[number]) => ({
    id: item.id, solverId: item.solverId, revision: item.revision,
    state: item.presentationState, validUntil: item.validUntil.toISOString(),
    objective: item.objective, preview: item.preview,
  });
  return <>
    <AppHeader />
    <main className="directory-page" id="main-content">
      <IntentCompetitionRefresh closesAt={intent.competitionClosesAt.toISOString()} />
      <IntentCompetitionView
        goal={intent.displayGoal}
        closesAt={intent.competitionClosesAt.toISOString()}
        observedAtSec={observedAtSec}
        current={rows.current.map(map)}
        history={rows.history.map(map)}
        tokenEvidence={snapshot.kind === "open-onchain" ? snapshot.tokenEvidence : undefined}
        composition={compositionPolicy && maximumLoss && receiptFloor ? {
          actions: compositionPolicy.allowedCapabilities.map(({ id }) => ({
            "aave-v3.supply": "Aave V3 supply",
            "curve-stableswap-ng.exact-input": "Curve exact input",
            "uniswap-v3.exact-input": "Uniswap V3 exact input",
          })[id] ?? id),
          maximumLossBps: maximumLoss.maximumLossBps,
          minimumReceiptValueBps: receiptFloor.minimumValueBps,
          horizonDays: compositionPolicy.objective.horizonDays,
        } : undefined}
      />
    </main>
  </>;
}
