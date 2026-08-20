import { Challenge } from "@okxweb3/mpp";
import { describe, expect, it } from "vitest";
import {
  SOLVER_SUCCESS_FEE_ATOMIC, buildSolverSuccessFeeTerms, solverSuccessFeeRequiredResponse,
} from "./solver-success-fee";

const input = {
  submissionId: "550e8400-e29b-41d4-a716-446655440000", solverId: "alpha-solver",
  owner: "0x1111111111111111111111111111111111111111" as const,
  recipient: "0x2222222222222222222222222222222222222222" as const,
  treasury: "0x3333333333333333333333333333333333333333" as const,
  realm: "getcobia.com", nowSec: 2_000_000_000, deadline: 2_000_000_200,
};

describe("solver success fee", () => {
  it("caps one deferred charge and pays the solver plus the fixed platform split", async () => {
    const terms = buildSolverSuccessFeeTerms(input);
    expect(terms).toMatchObject({ amount: SOLVER_SUCCESS_FEE_ATOMIC,
      recipient: input.recipient, expiresAt: input.deadline,
      splits: [{ amount: "10000", recipient: input.treasury }] });
    const response = solverSuccessFeeRequiredResponse(terms);
    expect(response.status).toBe(402);
    const challenge = Challenge.fromResponse(response);
    expect(challenge.request).toMatchObject({ amount: "100000", recipient: input.recipient });
    await expect(response.json()).resolves.toMatchObject({ code: "SOLVER_SUCCESS_FEE_REQUIRED" });
  });
});
