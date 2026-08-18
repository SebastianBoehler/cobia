import type { solverSubmissionState } from "../db/program-schema-v2";

type StoredSubmissionState = (typeof solverSubmissionState.enumValues)[number];
export type SubmissionPresentationState =
  | "pending"
  | "current"
  | "expired"
  | "rejected"
  | "superseded"
  | "executed"
  | "failed";

export function projectSubmissionState(
  submission: { state: StoredSubmissionState; validUntil: Date },
  observedAtSec: number,
): SubmissionPresentationState {
  if (submission.state === "executed") return "executed";
  if (submission.state === "rejected") return "rejected";
  if (submission.state === "superseded") return "superseded";
  if (submission.state === "failed") return "failed";
  if (submission.state === "proposed") return "pending";
  if (submission.validUntil.getTime() <= observedAtSec * 1_000) return "expired";
  return submission.state === "attested" ? "current" : "pending";
}
