import type { SolverDecisionV1 } from "@cobia/solver-sdk";
import { describe, expect, it, vi } from "vitest";
import { decideAgentic } from "../src/decision-source";
import { WorkLimiter } from "../src/job-control";

const abstain = { version: 1, decision: "abstain",
  reasonCode: "NO_SUPPORTED_REFERENCE_ROUTE" } as const;

describe("agentic solver decisions", () => {
  it("always runs the Codex decision lane", async () => {
    const submit = { version: 1, decision: "submit" } as unknown as SolverDecisionV1;
    const solve = vi.fn(async () => submit);

    await expect(decideAgentic({ solve })).resolves.toEqual({ decision: submit, source: "codex" });
    expect(solve).toHaveBeenCalledOnce();
  });

  it("resolves a failed open search as an explicit terminal abstention", async () => {
    const error = new Error("provider unavailable");
    const onOpenError = vi.fn();

    await expect(decideAgentic({ solve: async () => { throw error; }, onOpenError }))
      .resolves.toEqual({ decision: { version: 1, decision: "abstain",
        reasonCode: "SOLVER_INTERNAL_ERROR" }, source: "host" });
    expect(onOpenError).toHaveBeenCalledWith(error);
  });

  it("bounds concurrent agentic jobs with the shared work limiter", async () => {
    const limiter = new WorkLimiter(1);
    const order: string[] = [];
    const schedule = <T>(work: () => Promise<T>) => limiter.run(work);

    const first = decideAgentic({ schedule,
      solve: async () => { order.push("first-open"); return abstain; } });
    const second = decideAgentic({ schedule,
      solve: async () => { order.push("second-open"); return abstain; } });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-open", "second-open"]);
  });
});
