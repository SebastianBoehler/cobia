import { aggregateSolverPerformanceV1 } from "@cobia/domain";

type RunRow = {
  intentId: string;
  state: "queued" | "running" | "completed" | "abstained" | "failed";
  createdAt: Date;
};
type SubmissionRow = {
  id: string;
  intentId: string | null;
  revision: number;
  state: "proposed" | "rejected" | "verified" | "attested" | "superseded" | "executed" | "failed";
  failureCodes: string[];
  createdAt: Date;
  objective?: { direction: "maximize" | "minimize"; atomic: string } | null;
};
type IntentRow = { id: string; chainId: number; selectedSubmissionId: string | null; policy: unknown };

const ACCEPTED = new Set(["verified", "attested", "superseded", "executed"]);
const REJECTED = new Set(["rejected", "failed"]);
const WINDOW_SEC = 30 * 24 * 60 * 60;

function isReplayRejection(codes: readonly string[]): boolean {
  return codes.some((code) => code.includes("REPLAY") || code.includes("SIMULATION"));
}

function requiredAtomic(policy: unknown): string | null {
  if (!policy || typeof policy !== "object") return null;
  const outcomes = (policy as { outcomes?: unknown }).outcomes;
  if (!Array.isArray(outcomes) || outcomes.length !== 1) return null;
  const outcome = outcomes[0];
  if (!outcome || typeof outcome !== "object") return null;
  const value = outcome as { kind?: unknown; atomic?: unknown };
  return ["minimum-final", "minimum-increase"].includes(String(value.kind)) &&
    typeof value.atomic === "string" && /^(0|[1-9][0-9]*)$/.test(value.atomic)
    ? value.atomic : null;
}

function outcomeQuality(
  intent: IntentRow,
  accepted: SubmissionRow[],
): { direction: "maximize" | "minimize"; requiredAtomic: string;
  firstAcceptedAtomic: string; bestAcceptedAtomic: string } | undefined {
  const required = requiredAtomic(intent.policy);
  const measured = accepted.filter((item): item is SubmissionRow & {
    objective: NonNullable<SubmissionRow["objective"]>;
  } => Boolean(item.objective)).sort((left, right) => left.revision - right.revision);
  const direction = measured[0]?.objective.direction;
  if (!required || !direction || measured.some(({ objective }) => objective.direction !== direction)) return undefined;
  const values = measured.map(({ objective }) => BigInt(objective.atomic));
  const best = direction === "maximize"
    ? values.reduce((left, right) => left > right ? left : right)
    : values.reduce((left, right) => left < right ? left : right);
  return {
    direction,
    requiredAtomic: required,
    firstAcceptedAtomic: measured[0]!.objective.atomic,
    bestAcceptedAtomic: best.toString(),
  };
}

function intentClass(policy: unknown): string {
  if (!policy || typeof policy !== "object") return "unknown";
  const value = policy as { executionChainIds?: unknown; outcomes?: unknown };
  if (Array.isArray(value.executionChainIds) && value.executionChainIds.length > 1) return "cross-chain";
  if (!Array.isArray(value.outcomes)) return "unknown";
  const kinds = new Set(value.outcomes.flatMap((outcome) =>
    outcome && typeof outcome === "object" && typeof (outcome as { kind?: unknown }).kind === "string"
      ? [(outcome as { kind: string }).kind] : []));
  if (kinds.size > 1) return "composed";
  if (kinds.has("x402-receipt")) return "x402";
  if (kinds.has("onchain-predicate")) return "predicate";
  if (kinds.has("minimum-final") || kinds.has("minimum-increase")) return "balance-outcome";
  return "unknown";
}

export function projectSolverPerformance(input: {
  solverId: string;
  observedAtSec: number;
  runs: RunRow[];
  submissions: SubmissionRow[];
  intents: IntentRow[];
}) {
  const fromSec = Math.max(0, input.observedAtSec - WINDOW_SEC);
  const byIntent = new Map<string, RunRow[]>();
  for (const run of input.runs) {
    const createdAtSec = Math.floor(run.createdAt.getTime() / 1_000);
    if (createdAtSec < fromSec || createdAtSec > input.observedAtSec) continue;
    byIntent.set(run.intentId, [...(byIntent.get(run.intentId) ?? []), run]);
  }
  const intentById = new Map(input.intents.map((intent) => [intent.id, intent]));
  const recordsBySegment = new Map<string, {
    chainId: number;
    intentClass: string;
    records: Parameters<typeof aggregateSolverPerformanceV1>[0]["records"];
  }>();

  for (const [intentId, runs] of byIntent) {
    const intent = intentById.get(intentId);
    if (!intent) throw new Error("Solver performance intent is unavailable");
    const resolved = input.submissions.filter((submission) =>
      submission.intentId === intentId && (ACCEPTED.has(submission.state) || REJECTED.has(submission.state)));
    const accepted = resolved.filter(({ state }) => ACCEPTED.has(state));
    const rejected = resolved.filter(({ state }) => REJECTED.has(state));
    const selected = resolved.find(({ id }) => id === intent.selectedSubmissionId);
    const decision: "submitted" | "failed" | "abstained" | null = resolved.length > 0 ? "submitted"
      : runs.some(({ state }) => state === "failed") ? "failed"
      : runs.some(({ state }) => state === "abstained") ? "abstained"
      : null;
    if (!decision) continue;
    const firstRunSec = Math.min(...runs.map(({ createdAt }) => Math.floor(createdAt.getTime() / 1_000)));
    const firstSubmissionSec = resolved.length === 0 ? null : Math.min(...resolved.map(({ createdAt }) =>
      Math.floor(createdAt.getTime() / 1_000)));
    const firstSubmissionLatencySec = firstSubmissionSec !== null && firstSubmissionSec >= firstRunSec
      ? firstSubmissionSec - firstRunSec : undefined;
    const record = {
      intentId,
      observedAtSec: firstRunSec,
      firstSubmissionLatencySec,
      decision,
      submissionCount: resolved.length,
      acceptedSubmissionCount: accepted.length,
      rejectedSubmissionCount: rejected.length,
      replayRejectedSubmissionCount: rejected.filter(({ failureCodes }) =>
        isReplayRejection(failureCodes)).length,
      won: Boolean(selected),
      execution: selected?.state === "executed" ? "succeeded" as const
        : selected ? "not-executed" as const : "unselected" as const,
      outcome: outcomeQuality(intent, accepted),
    };
    const classified = intentClass(intent.policy);
    const key = `${intent.chainId}:${classified}`;
    const segment = recordsBySegment.get(key) ?? { chainId: intent.chainId, intentClass: classified, records: [] };
    segment.records.push(record);
    recordsBySegment.set(key, segment);
  }

  return [...recordsBySegment.values()].sort((left, right) =>
    left.chainId - right.chainId || left.intentClass.localeCompare(right.intentClass)).map(({ chainId, intentClass, records }) =>
    aggregateSolverPerformanceV1({
      solverId: input.solverId,
      segment: { chainId, intentClass },
      window: { fromSec, toSec: input.observedAtSec + 1 },
      records,
    }));
}
