import type { SolverDecisionV1 } from "@cobia/solver-sdk";
import { describe, expect, it, vi } from "vitest";
import { decideCuratedFirst } from "../src/decision-source";

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
});
