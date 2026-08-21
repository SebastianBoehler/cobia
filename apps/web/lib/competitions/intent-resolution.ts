type IntentState = "signed" | "collecting" | "closed" | "selected" | "executed" | "failed";
type SubmissionState =
  | "proposed" | "rejected" | "verified" | "attested" | "superseded" | "executed" | "failed";

type IntentResolution = {
  id: string;
  state: IntentState;
  selectedSubmissionId: string | null;
};

type SubmissionResolution = {
  id: string;
  intentId: string | null;
  state: SubmissionState;
};

export function projectSelectedSubmissionId(
  intent: Pick<IntentResolution, "id" | "selectedSubmissionId">,
  submissions: Pick<SubmissionResolution, "id" | "intentId" | "state">[],
): string | null {
  if (intent.selectedSubmissionId) return intent.selectedSubmissionId;
  const executed = submissions.filter((submission) =>
    submission.intentId === intent.id && submission.state === "executed");
  return executed.length === 1 ? executed[0]!.id : null;
}

export function projectIntentResolution(
  intent: IntentResolution,
  submissions: SubmissionResolution[],
): Pick<IntentResolution, "state" | "selectedSubmissionId"> {
  const selectedSubmissionId = projectSelectedSubmissionId(intent, submissions);
  const selectedWasExecuted = submissions.some((submission) =>
    submission.id === selectedSubmissionId && submission.intentId === intent.id && submission.state === "executed");
  return {
    selectedSubmissionId,
    state: selectedWasExecuted ? "executed" : intent.state,
  };
}
