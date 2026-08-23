import { z } from "zod";
import { canRetryBeforeCompetitionClose } from "./intent-deadline";
import { IntentAttempts } from "./job-control";
import {
  submitSolverDecision, type DecisionClient, type RunSigner,
} from "./solver-run";

const FailureCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

function reasonCode(error: unknown) {
  const parsed = FailureCodeSchema.safeParse(
    error && typeof error === "object" && "code" in error ? error.code : undefined,
  );
  return parsed.success ? parsed.data : "SOLVER_INTERNAL_ERROR";
}

export async function handleIntentError(input: {
  error: unknown;
  intent: { id: string; snapshotHash: string; competitionClosesAt: number };
  attempts: IntentAttempts;
  maxAttempts: number;
  client: DecisionClient;
  account: RunSigner;
  solverId: string;
  persist(): Promise<void>;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const failed = input.attempts.failed(input.intent.id, nowMs);
  const retryable = failed.attempts < input.maxAttempts && canRetryBeforeCompetitionClose({
    competitionClosesAt: input.intent.competitionClosesAt,
    retryAfterMs: failed.retryAfterMs,
  });
  let terminalState: string | undefined;
  let terminalError: string | undefined;
  if (!retryable) {
    try {
      const revision = input.attempts.revision(input.intent.id);
      const receipt = await submitSolverDecision({
        client: input.client, account: input.account, solverId: input.solverId,
        intent: input.intent, revision, nowSec: Math.floor(nowMs / 1_000),
        decision: { version: 1, decision: "abstain", reasonCode: reasonCode(input.error) },
      });
      if (receipt) {
        input.attempts.completed(input.intent.id, revision, receipt.state);
        terminalState = receipt.state;
      } else {
        input.attempts.stop(input.intent.id);
      }
    } catch (error) {
      input.attempts.stop(input.intent.id, "error");
      terminalError = error instanceof Error ? error.message : String(error);
    }
  }
  await input.persist();
  return {
    attempts: failed.attempts, retryable,
    retryAfterMs: retryable ? failed.retryAfterMs : undefined,
    terminalState, terminalError,
  };
}
