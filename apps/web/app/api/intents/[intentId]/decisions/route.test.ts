import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidSolverDecisionError,
  InvalidSolverDecisionSignatureError,
  SolverDecisionUnavailableError,
} from "../../../../../lib/open-exchange/decision-intake";
import { SolverDecisionReplayError } from "../../../../../lib/db/solver-decision-claims";

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../../../../../lib/runtime/market", () => ({
  submitOpenSolverDecision: mocks.submit,
}));

import { POST } from "./route";

const intentId = "550e8400-e29b-41d4-a716-446655440000";
const body = { claim: { intentId }, signature: `0x${"11".repeat(65)}`, decision: { version: 1 } };

function request(value: unknown = body) {
  return new Request(`https://cobia.example/api/intents/${intentId}/decisions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
  });
}

const context = (value = intentId) => ({ params: Promise.resolve({ intentId: value }) }) as
  RouteContext<"/api/intents/[intentId]/decisions">;

describe("solver decision API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submit.mockResolvedValue({ intentId, solverId: "alpha-solver", revision: 1, state: "accepted" });
  });

  it("accepts an independently processed signed solver decision", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ state: "accepted" });
    expect(mocks.submit).toHaveBeenCalledWith(body);
  });

  it("rejects an intent mismatch before intake", async () => {
    const response = await POST(request(), context("550e8400-e29b-41d4-a716-446655440099"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INTENT_MISMATCH" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each([
    [new InvalidSolverDecisionError(), 400, "INVALID_DECISION"],
    [new InvalidSolverDecisionSignatureError(), 400, "INVALID_SIGNATURE"],
    [new SolverDecisionReplayError(), 409, "DECISION_REPLAY"],
    [new SolverDecisionUnavailableError(), 409, "DECISION_UNAVAILABLE"],
  ])("maps intake errors without exposing internals", async (error, status, code) => {
    mocks.submit.mockRejectedValueOnce(error);
    const response = await POST(request(), context());
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
