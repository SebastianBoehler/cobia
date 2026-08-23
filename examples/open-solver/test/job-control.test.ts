import { describe, expect, it, vi } from "vitest";
import { IntentAttempts, WorkLimiter } from "../src/job-control";

describe("solver job controls", () => {
  it("backs off a failed intent and stops after the configured attempt ceiling", () => {
    const attempts = new IntentAttempts({}, { maxAttempts: 2, retryBaseMs: 30_000 });
    expect(attempts.isHandled("intent", 1_000)).toBe(false);

    const first = attempts.failed("intent", 1_000);
    expect(first).toMatchObject({ attempts: 1, retryAfterMs: 31_000 });
    expect(attempts.isHandled("intent", 30_999)).toBe(true);
    expect(attempts.isHandled("intent", 31_000)).toBe(false);

    const second = attempts.failed("intent", 31_000);
    expect(second.attempts).toBe(2);
    expect(attempts.isHandled("intent", Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("treats a submitted or abstained decision as terminal", () => {
    const attempts = new IntentAttempts({}, { maxAttempts: 2, retryBaseMs: 30_000 });
    attempts.completed("intent", 1, "verified");
    expect(attempts.isHandled("intent", 0)).toBe(true);
  });

  it("can stop a retry that cannot finish before the competition closes", () => {
    const state = {};
    const attempts = new IntentAttempts(state, { maxAttempts: 2, retryBaseMs: 30_000 });
    attempts.failed("intent", 1_000);

    attempts.stop("intent");

    expect(attempts.isHandled("intent", 1_000)).toBe(true);
    expect(state).toEqual({ intent: { state: "expired", attempts: 1 } });
  });

  it("reuses an unresolved revision after an error or process restart", () => {
    const state = {};
    const attempts = new IntentAttempts(state, { maxAttempts: 2, retryBaseMs: 30_000 });

    expect(attempts.revision("intent")).toBe(1);
    attempts.started("intent", 1);
    expect(attempts.isHandled("intent", 0)).toBe(false);
    attempts.failed("intent", 1_000);

    expect(attempts.revision("intent")).toBe(1);
    expect(state).toEqual({ intent: {
      state: "error", revision: 1, attempts: 1, retryAfterMs: 31_000,
    } });
  });

  it("never starts more work than the concurrency ceiling", async () => {
    const limiter = new WorkLimiter(2);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const work = vi.fn(() => limiter.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    }));

    const jobs = [work(), work(), work()];
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(peak).toBe(2);
    releases.shift()!();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    await Promise.all(jobs);
    expect(peak).toBe(2);
  });
});
