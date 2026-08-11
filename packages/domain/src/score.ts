import type { DecisionBundle } from "./bundle";

export const RISK_PENALTY_BPS = {
  low: 5,
  medium: 25,
  high: 100,
  critical: 100,
} as const;

export function riskPenaltyBps(bundle: DecisionBundle): number {
  return bundle.riskFlags.reduce(
    (total, flag) => total + RISK_PENALTY_BPS[flag.severity],
    0,
  );
}

export function quoteRiskGrade(
  bundle: Pick<DecisionBundle, "riskFlags">,
): "unassessed" | "moderate" | "elevated" {
  if (
    bundle.riskFlags.some(
      (flag) => flag.severity === "high" || flag.severity === "critical",
    )
  ) {
    return "elevated";
  }
  if (bundle.riskFlags.some((flag) => flag.severity === "medium")) {
    return "moderate";
  }
  // Phase A has no trusted provenance for an affirmative low-risk assessment.
  return "unassessed";
}
