import type { SolverDecisionV1 } from "@cobia/solver-sdk";

export async function decideAgentic(input: {
  solve(): Promise<SolverDecisionV1>;
  onOpenError?(error: unknown): void;
  schedule?<T>(work: () => Promise<T>): Promise<T>;
}) {
  const schedule = input.schedule ?? (<T>(work: () => Promise<T>) => work());
  try {
    return { decision: await schedule(input.solve), source: "codex" as const };
  } catch (error) {
    input.onOpenError?.(error);
    return { decision: { version: 1 as const, decision: "abstain" as const,
      reasonCode: "SOLVER_INTERNAL_ERROR" }, source: "host" as const };
  }
}
