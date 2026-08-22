export function goalTitleDensity(goal: string): "short" | "long" {
  return goal.trim().length > 120 ? "long" : "short";
}
