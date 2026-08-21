import type { SolverDecisionV1 } from "@cobia/solver-sdk";

export async function decideCuratedFirst(input: {
  solveCurated(): Promise<SolverDecisionV1>;
  solveOpen(): Promise<SolverDecisionV1>;
  onCuratedError?(error: unknown): void;
}) {
  try {
    const decision = await input.solveCurated();
    if (decision.decision === "submit") {
      return { decision, source: "curated" as const };
    }
  } catch (error) {
    input.onCuratedError?.(error);
  }
  return { decision: await input.solveOpen(), source: "codex" as const };
}
