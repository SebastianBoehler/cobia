import type { RouteQuote } from "@cobia/domain";

const labels = {
  unassessed: "Unassessed",
  moderate: "Moderate",
  elevated: "Elevated",
} satisfies Record<RouteQuote["riskGrade"], string>;

export function riskGradeLabel(grade: RouteQuote["riskGrade"]): string {
  return labels[grade];
}
