import { z } from "zod";

const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const SegmentSchema = z.object({
  chainId: z.number().int().positive(),
  intentClass: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();
const WindowSchema = z.object({
  fromSec: z.number().int().nonnegative(),
  toSec: z.number().int().positive(),
}).strict().refine(({ fromSec, toSec }) => fromSec < toSec, "Invalid performance window");
const OutcomeSchema = z.object({
  direction: z.enum(["maximize", "minimize"]),
  requiredAtomic: AtomicSchema.refine((value) => BigInt(value) > 0n, "Required outcome must be positive"),
  firstAcceptedAtomic: AtomicSchema,
  bestAcceptedAtomic: AtomicSchema,
}).strict();
const RecordSchema = z.object({
  intentId: z.string().uuid(),
  observedAtSec: z.number().int().nonnegative(),
  firstSubmissionLatencySec: z.number().int().nonnegative().optional(),
  decision: z.enum(["submitted", "abstained", "failed"]),
  submissionCount: z.number().int().nonnegative(),
  acceptedSubmissionCount: z.number().int().nonnegative(),
  rejectedSubmissionCount: z.number().int().nonnegative(),
  replayRejectedSubmissionCount: z.number().int().nonnegative(),
  won: z.boolean(),
  execution: z.enum(["unselected", "not-executed", "succeeded", "failed"]),
  outcome: OutcomeSchema.optional(),
}).strict().superRefine((record, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (record.decision === "abstained" && record.submissionCount !== 0) {
    issue("Abstention cannot contain submissions");
  }
  if (record.decision === "failed" && record.submissionCount !== 0) {
    issue("Failed generation cannot contain submissions");
  }
  if (record.decision === "submitted" && record.submissionCount === 0) {
    issue("Submitted intent requires a submission");
  }
  if (record.acceptedSubmissionCount + record.rejectedSubmissionCount !== record.submissionCount) {
    issue("Every submission must have a verifier result");
  }
  if (record.replayRejectedSubmissionCount > record.rejectedSubmissionCount) {
    issue("Replay rejections cannot exceed verifier rejections");
  }
  if (record.won && record.acceptedSubmissionCount === 0) {
    issue("A winning intent requires an accepted submission");
  }
  if (record.execution !== "unselected" && !record.won) {
    issue("Only a winning intent can reach execution");
  }
  if (record.outcome && record.acceptedSubmissionCount === 0) {
    issue("Verified outcome requires an accepted submission");
  }
  if (record.outcome) validateOutcome(record.outcome, issue);
  if (record.firstSubmissionLatencySec !== undefined && record.decision !== "submitted") {
    issue("Only a submitted intent can have submission latency");
  }
});

export const ESTABLISHED_SAMPLE_SIZE = 10;
export type SolverPerformanceStatus = "unavailable" | "preliminary" | "established";

function validateOutcome(outcome: z.infer<typeof OutcomeSchema>, issue: (message: string) => void) {
  const required = BigInt(outcome.requiredAtomic);
  const first = BigInt(outcome.firstAcceptedAtomic);
  const best = BigInt(outcome.bestAcceptedAtomic);
  if (outcome.direction === "maximize" && (first < required || best < first)) {
    issue("Maximized outcomes must meet the bound and improve monotonically");
  }
  if (outcome.direction === "minimize" && (first > required || best > first)) {
    issue("Minimized outcomes must meet the bound and improve monotonically");
  }
}

function status(sampleSize: number): SolverPerformanceStatus {
  if (sampleSize === 0) return "unavailable";
  return sampleSize >= ESTABLISHED_SAMPLE_SIZE ? "established" : "preliminary";
}

function rate(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rateBps: denominator === 0 ? null : Math.floor((numerator * 10_000) / denominator),
    status: status(denominator),
  };
}

function bps(numerator: bigint, denominator: bigint): number {
  return Number((numerator * 10_000n) / denominator);
}

function outcomeValues(outcome: z.infer<typeof OutcomeSchema>) {
  const required = BigInt(outcome.requiredAtomic);
  const first = BigInt(outcome.firstAcceptedAtomic);
  const best = BigInt(outcome.bestAcceptedAtomic);
  return outcome.direction === "maximize"
    ? { margin: bps(best - required, required), improvement: bps(best - first, first) }
    : { margin: bps(required - best, required), improvement: bps(first - best, first) };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.floor((sorted[middle - 1]! + sorted[middle]!) / 2);
}

const InputSchema = z.object({
  solverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  segment: SegmentSchema,
  window: WindowSchema,
  records: z.array(RecordSchema),
}).strict();

export function aggregateSolverPerformanceV1(input: z.input<typeof InputSchema>) {
  const parsed = InputSchema.parse(input);
  const ids = new Set<string>();
  for (const record of parsed.records) {
    if (ids.has(record.intentId)) throw new Error("Duplicate intent performance record");
    ids.add(record.intentId);
    if (record.observedAtSec < parsed.window.fromSec || record.observedAtSec >= parsed.window.toSec) {
      throw new Error("Performance record is outside the requested window");
    }
  }
  const submitted = parsed.records.filter(({ decision }) => decision === "submitted");
  const abstained = parsed.records.filter(({ decision }) => decision === "abstained").length;
  const failed = parsed.records.filter(({ decision }) => decision === "failed").length;
  const submissions = submitted.reduce((total, record) => total + record.submissionCount, 0);
  const accepted = submitted.reduce((total, record) => total + record.acceptedSubmissionCount, 0);
  const rejected = submitted.reduce((total, record) => total + record.rejectedSubmissionCount, 0);
  const replayRejected = submitted.reduce((total, record) => total + record.replayRejectedSubmissionCount, 0);
  const won = submitted.filter(({ won: didWin }) => didWin).length;
  const executionAttempts = submitted.filter(({ execution }) => execution === "succeeded" || execution === "failed").length;
  const successfulExecutions = submitted.filter(({ execution }) => execution === "succeeded").length;
  const quality = submitted.flatMap(({ outcome }) => outcome ? [outcomeValues(outcome)] : []);
  const margins = quality.map(({ margin }) => margin);
  const improvements = quality.map(({ improvement }) => improvement);
  const firstSubmissionLatencies = submitted.flatMap(({ firstSubmissionLatencySec }) =>
    firstSubmissionLatencySec === undefined ? [] : [firstSubmissionLatencySec]);

  return {
    version: 1 as const,
    solverId: parsed.solverId,
    segment: parsed.segment,
    window: parsed.window,
    establishedSampleSize: ESTABLISHED_SAMPLE_SIZE,
    counts: {
      observedIntents: parsed.records.length,
      submittedIntents: submitted.length,
      abstainedIntents: abstained,
      failedIntents: failed,
      submissions,
      acceptedSubmissions: accepted,
      rejectedSubmissions: rejected,
      replayRejectedSubmissions: replayRejected,
      wonIntents: won,
      executionAttempts,
      successfulExecutions,
    },
    rates: {
      participation: rate(submitted.length, parsed.records.length),
      generationSuccess: rate(submitted.length, submitted.length + failed),
      verifierAcceptance: rate(accepted, submissions),
      win: rate(won, submitted.length),
      executionSuccess: rate(successfulExecutions, executionAttempts),
      replayRejection: rate(replayRejected, submissions),
    },
    outcomeQuality: {
      medianVerifiedMarginBps: median(margins),
      verifiedMarginSampleSize: margins.length,
      verifiedMarginStatus: status(margins.length),
      medianRevisionImprovementBps: median(improvements),
      revisionImprovementSampleSize: improvements.length,
      revisionImprovementStatus: status(improvements.length),
    },
    responsiveness: {
      medianFirstSubmissionLatencySec: median(firstSubmissionLatencies),
      sampleSize: firstSubmissionLatencies.length,
      status: status(firstSubmissionLatencies.length),
    },
  };
}

export type SolverPerformanceReportV1 = ReturnType<typeof aggregateSolverPerformanceV1>;
