import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidSolverRunError, InvalidSolverRunSignatureError, SolverRunUnavailableError,
} from "../../../../../lib/open-exchange/run-intake";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../../../../../lib/runtime/market", () => ({ startOpenSolverRun: mocks.start }));

import { POST } from "./route";

const intentId = "550e8400-e29b-41d4-a716-446655440000";
const body = { claim: { intentId }, signature: `0x${"11".repeat(65)}` };
const request = () => new Request(`https://cobia.example/api/intents/${intentId}/runs`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const context = (value = intentId) => ({ params: Promise.resolve({ intentId: value }) }) as
  RouteContext<"/api/intents/[intentId]/runs">;

describe("solver run API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ intentId, solverId: "alpha-solver", revision: 1,
      state: "running" });
  });

  it("accepts a signed solver run before generation starts", async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ state: "running" });
    expect(mocks.start).toHaveBeenCalledWith(body);
  });

  it("rejects an intent mismatch before intake", async () => {
    const response = await POST(request(), context("550e8400-e29b-41d4-a716-446655440099"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INTENT_MISMATCH" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([
    [new InvalidSolverRunError(), 400, "INVALID_RUN"],
    [new InvalidSolverRunSignatureError(), 400, "INVALID_SIGNATURE"],
    [new SolverRunUnavailableError(), 409, "RUN_UNAVAILABLE"],
  ])("maps run intake errors without exposing internals", async (error, status, code) => {
    mocks.start.mockRejectedValueOnce(error);
    const response = await POST(request(), context());
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
