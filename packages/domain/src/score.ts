import type { DecisionBundle } from "./bundle";

export const RISK_PENALTY_BPS = {
  low: 5,
  medium: 25,
  high: 100,
} as const;

export function riskPenaltyBps(bundle: DecisionBundle): number {
  return bundle.riskFlags.reduce((total, flag) => {
    if (flag.severity === "critical") return total;
    return total + RISK_PENALTY_BPS[flag.severity];
  }, 0);
}

export function quoteRiskGrade(
  bundle: DecisionBundle,
): "low" | "moderate" | "elevated" {
  if (bundle.riskFlags.some((flag) => flag.severity === "high")) {
    return "elevated";
  }
  if (bundle.riskFlags.some((flag) => flag.severity === "medium")) {
    return "moderate";
  }
  return "low";
}
