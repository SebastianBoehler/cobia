import { commitment } from "@cobia/domain";
import { SolverDecisionV1Schema, type SolverDecisionV1 } from "@cobia/solvers";
import type { SolverIntentListV1, SolverIntentV1 } from "./client";

export { SolverDecisionV1Schema, type SolverDecisionV1 };

interface IntentClientV1 {
  listIntents(): Promise<SolverIntentListV1>;
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Polling transport with subscription semantics: every intent gets an independent job. */
export async function watchSolverIntents(input: {
  client: IntentClientV1;
  onIntent(intent: SolverIntentV1): Promise<void>;
  onError(error: unknown, intent?: SolverIntentV1): void | Promise<void>;
  isHandled?(intent: SolverIntentV1): boolean;
  pollIntervalMs?: number;
  maxConsecutivePollFailures?: number;
  onPoll?(): void | Promise<void>;
  signal: AbortSignal;
}) {
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  const maxFailures = input.maxConsecutivePollFailures ?? 12;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error("Solver intent poll interval must be a positive integer");
  }
  if (!Number.isSafeInteger(maxFailures) || maxFailures < 1) {
    throw new Error("Solver poll failure limit must be a positive integer");
  }
  const jobs = new Map<string, Promise<void>>();
  let consecutiveFailures = 0;
  while (!input.signal.aborted) {
    try {
      const { intents } = await input.client.listIntents();
      consecutiveFailures = 0;
      await input.onPoll?.();
      for (const intent of intents) {
        if (jobs.has(intent.id) || input.isHandled?.(intent)) continue;
        const job = Promise.resolve().then(() => input.onIntent(intent))
          .catch((error) => input.onError(error, intent))
          .finally(() => { jobs.delete(intent.id); });
        jobs.set(intent.id, job);
      }
    } catch (error) {
      await input.onError(error);
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxFailures) {
        throw new Error(`Solver exchange remained unavailable for ${consecutiveFailures} consecutive failures`, {
          cause: error,
        });
      }
    }
    await waitForNextPoll(pollIntervalMs, input.signal);
  }
  await Promise.allSettled(jobs.values());
}

export async function runSolverCycle(input: {
  client: IntentClientV1;
  solve(intent: SolverIntentV1): Promise<unknown>;
}) {
  const { intents } = await input.client.listIntents();
  return Promise.all(intents.map(async (intent) => {
    const decision = SolverDecisionV1Schema.parse(await input.solve(intent));
    if (decision.decision === "submit") {
      const matches = decision.proposalKind === "general-asset-program"
        ? decision.program.owner === intent.policy.owner &&
          decision.program.policyHash === intent.policyHash
        : decision.program.requestId === intent.id &&
          decision.program.owner === intent.policy.owner &&
          (!decision.evidence ||
            decision.evidence.programHash === commitment(decision.program)) &&
          (decision.proposalKind !== "transaction-program" ||
            decision.program.policyHash === intent.policyHash);
      if (!matches) {
        throw new Error(`Solver proposal for ${intent.id} does not match signed intent authority`);
      }
    }
    return { intentId: intent.id, decision };
  }));
}
