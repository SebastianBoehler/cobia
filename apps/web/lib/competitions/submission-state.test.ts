import { describe, expect, it } from "vitest";
import { projectSubmissionState } from "./submission-state";

const observedAtSec = 2_000_000_000;
const future = new Date((observedAtSec + 60) * 1_000);
const past = new Date((observedAtSec - 1) * 1_000);

describe("solver submission presentation state", () => {
  it.each([
    ["attested", future, "current"],
    ["verified", future, "pending"],
    ["attested", past, "expired"],
    ["verified", past, "expired"],
    ["rejected", future, "rejected"],
    ["superseded", future, "superseded"],
    ["executed", past, "executed"],
    ["failed", future, "failed"],
    ["proposed", future, "pending"],
  ] as const)("projects %s with explicit freshness as %s", (state, validUntil, expected) => {
    expect(projectSubmissionState({ state, validUntil }, observedAtSec)).toBe(expected);
  });

  it("does not read wall-clock time implicitly", () => {
    expect(projectSubmissionState({ state: "attested", validUntil: future }, observedAtSec + 61))
      .toBe("expired");
    expect(projectSubmissionState({ state: "attested", validUntil: future }, observedAtSec))
      .toBe("current");
  });
});
