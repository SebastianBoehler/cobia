import { describe, expect, it } from "vitest";
import { canRetryBeforeCompetitionClose, competitionWorkTimeoutMs } from
  "../src/intent-deadline";

describe("solver competition work window", () => {
  it("caps open exploration so signing and submission retain a safety window", () => {
    expect(competitionWorkTimeoutMs({
      competitionClosesAt: 200,
      maximumMs: 120_000,
      nowMs: 100_000,
    })).toBe(95_000);
  });

  it("rejects work after the submission safety window begins", () => {
    expect(competitionWorkTimeoutMs({
      competitionClosesAt: 105,
      maximumMs: 120_000,
      nowMs: 100_000,
    })).toBe(0);
  });

  it("does not retry when backoff would consume the submission safety window", () => {
    expect(canRetryBeforeCompetitionClose({
      competitionClosesAt: 140,
      retryAfterMs: 135_000,
    })).toBe(false);
    expect(canRetryBeforeCompetitionClose({
      competitionClosesAt: 141,
      retryAfterMs: 135_000,
    })).toBe(true);
  });
});
