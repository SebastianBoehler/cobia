const SUBMISSION_RESERVE_MS = 5_000;

export function competitionWorkTimeoutMs(input: {
  competitionClosesAt: number;
  maximumMs: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  return Math.max(0, Math.min(input.maximumMs,
    input.competitionClosesAt * 1_000 - nowMs - SUBMISSION_RESERVE_MS));
}

export function canRetryBeforeCompetitionClose(input: {
  competitionClosesAt: number;
  retryAfterMs: number;
}) {
  return input.retryAfterMs < input.competitionClosesAt * 1_000 - SUBMISSION_RESERVE_MS;
}
