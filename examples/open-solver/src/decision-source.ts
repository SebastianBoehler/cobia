import type { SolverDecisionV1 } from "@cobia/solver-sdk";

export async function decideCuratedFirst(input: {
  solveCurated(): Promise<SolverDecisionV1>;
  solveOpen(): Promise<SolverDecisionV1>;
  onCuratedError?(error: unknown): void;
  onOpenError?(error: unknown): void;
  schedule?<T>(work: () => Promise<T>): Promise<T>;
}) {
  const schedule = input.schedule ?? (<T>(work: () => Promise<T>) => work());
  try {
    const decision = await schedule(input.solveCurated);
    if (decision.decision === "submit") {
      return { decision, source: "curated" as const };
    }
  } catch (error) {
    input.onCuratedError?.(error);
  }
  try {
    return { decision: await schedule(input.solveOpen), source: "codex" as const };
  } catch (error) {
    input.onOpenError?.(error);
    return { decision: { version: 1 as const, decision: "abstain" as const,
      reasonCode: "SOLVER_INTERNAL_ERROR" }, source: "host" as const };
  }
}
