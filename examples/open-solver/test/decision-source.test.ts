import type { SolverDecisionV1 } from "@cobia/solver-sdk";
import { describe, expect, it, vi } from "vitest";
import { decideCuratedFirst } from "../src/decision-source";
import { WorkLimiter } from "../src/job-control";

const abstain = { version: 1, decision: "abstain",
  reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE" } as const;

describe("curated-first solver decisions", () => {
  it("returns a verified curated submission without paying for an open search", async () => {
    const submit = { version: 1, decision: "submit" } as unknown as SolverDecisionV1;
    const solveOpen = vi.fn();

    await expect(decideCuratedFirst({ solveCurated: async () => submit, solveOpen }))
      .resolves.toEqual({ decision: submit, source: "curated" });
    expect(solveOpen).not.toHaveBeenCalled();
  });

  it("keeps the open Codex lane when the curated solver abstains", async () => {
    const solveOpen = vi.fn(async () => abstain);

    await expect(decideCuratedFirst({ solveCurated: async () => abstain, solveOpen }))
      .resolves.toEqual({ decision: abstain, source: "codex" });
    expect(solveOpen).toHaveBeenCalledOnce();
  });

  it("keeps the open Codex lane when curated infrastructure fails", async () => {
    const error = new Error("fork unavailable");
    const onCuratedError = vi.fn();

    await expect(decideCuratedFirst({ solveCurated: async () => { throw error; },
      solveOpen: async () => abstain, onCuratedError }))
      .resolves.toEqual({ decision: abstain, source: "codex" });
    expect(onCuratedError).toHaveBeenCalledWith(error);
  });

  it("resolves a failed open search as an explicit terminal abstention", async () => {
    const error = new Error("provider unavailable");
    const onOpenError = vi.fn();

    await expect(decideCuratedFirst({ solveCurated: async () => abstain,
      solveOpen: async () => { throw error; }, onOpenError }))
      .resolves.toEqual({ decision: { version: 1, decision: "abstain",
        reasonCode: "SOLVER_INTERNAL_ERROR" }, source: "host" });
    expect(onOpenError).toHaveBeenCalledWith(error);
  });

  it("lets queued curated work run before a long open fallback", async () => {
    const limiter = new WorkLimiter(1);
    const order: string[] = [];
    const schedule = <T>(work: () => Promise<T>) => limiter.run(work);

    const first = decideCuratedFirst({ schedule,
      solveCurated: async () => { order.push("first-curated"); return abstain; },
      solveOpen: async () => { order.push("first-open"); return abstain; } });
    const second = decideCuratedFirst({ schedule,
      solveCurated: async () => { order.push("second-curated"); return abstain; },
      solveOpen: async () => { order.push("second-open"); return abstain; } });

    await Promise.all([first, second]);
    expect(order.slice(0, 3)).toEqual(["first-curated", "second-curated", "first-open"]);
  });
});
