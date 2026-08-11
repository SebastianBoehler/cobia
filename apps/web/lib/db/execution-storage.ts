import { commitment } from "@cobia/domain";
import { randomUUID } from "node:crypto";
import type { CobiaDatabase } from "./client";
import {
  BeginExecutionInputSchema,
  PrepareExecutionStepInputSchema,
} from "./execution-records";
import {
  cobiaActivityEvents,
  cobiaExecutionAttempts,
  cobiaExecutionSteps,
} from "./schema";

type AttemptRow = typeof cobiaExecutionAttempts.$inferSelect;
type StepRow = typeof cobiaExecutionSteps.$inferSelect;

export function requireExecutionRow<T>(rows: T[], message: string): T {
  const value = rows[0];
  if (!value) throw new Error(message);
  return value;
}

export function sameExecutionJson(left: unknown, right: unknown): boolean {
  return commitment(left) === commitment(right);
}

export function assertAttemptRetry(
  stored: AttemptRow,
  input: ReturnType<typeof BeginExecutionInputSchema.parse>,
) {
  const matches = stored.routeId === input.routeId
    && stored.bundleHash === input.bundleHash
    && stored.buyer === input.buyer
    && stored.executionChainId === input.executionChainId
    && stored.rehearsalId === input.rehearsalId
    && stored.rehearsalTraceHash === input.rehearsalTraceHash
    && stored.proofHash === input.proofHash
    && stored.proofNonce === input.proofNonce
    && stored.proofExpiresAt.getTime() === input.proofExpiresAt.getTime();
  if (!matches) throw new Error("Execution attempt conflicts with stored authority");
}

export function assertStepRetry(
  stored: StepRow,
  input: ReturnType<typeof PrepareExecutionStepInputSchema.parse>,
) {
  const matches = stored.attemptId === input.attemptId
    && stored.ordinal === input.ordinal
    && stored.kind === input.kind
    && stored.from === input.from
    && stored.to === input.to
    && stored.valueAtomic === input.valueAtomic
    && stored.calldata === input.data
    && stored.calldataHash === input.calldataHash
    && sameExecutionJson(stored.semantic, input.semantic)
    && stored.preBlockNumber === input.preBlockNumber
    && stored.preBlockHash === input.preBlockHash
    && stored.expectedNonce === input.expectedNonce
    && stored.gasEstimateAtomic === input.gasEstimateAtomic;
  if (!matches) throw new Error("Prepared execution step conflicts with stored transaction");
}

export async function executionActivity(
  tx: Parameters<Parameters<CobiaDatabase["transaction"]>[0]>[0],
  attempt: AttemptRow,
  kind: string,
  status: string,
  detail: Record<string, unknown>,
  transactionHash?: string,
) {
  await tx.insert(cobiaActivityEvents).values({
    id: randomUUID(),
    wallet: attempt.buyer,
    executionChainId: attempt.executionChainId,
    kind,
    status,
    routeId: attempt.routeId,
    transactionHash,
    detail: { attemptId: attempt.id, ...detail },
    occurredAt: new Date(),
  });
}
