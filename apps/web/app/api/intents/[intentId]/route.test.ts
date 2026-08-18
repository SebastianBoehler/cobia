import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), list: vi.fn(),
}));
vi.mock("../../../../lib/runtime/market", () => ({
  getIntentRepository: () => ({ get: mocks.get }),
  getSolverSubmissionRepository: () => ({ listForIntent: mocks.list }),
}));

import { GET } from "./route";

const intentId = "550e8400-e29b-41d4-a716-446655440000";
const context = (id: string) => ({ params: Promise.resolve({ intentId: id }) });

describe("intent competition reads", () => {
  it("returns explicit current and historical submission collections", async () => {
    mocks.get.mockResolvedValue({
      id: intentId, owner: "0x1111111111111111111111111111111111111111",
      displayGoal: "Supply USDG", policyHash: `0x${"22".repeat(32)}`,
      state: "collecting", competitionClosesAt: new Date("2033-05-18T03:35:00Z"),
      selectedSubmissionId: null,
    });
    mocks.list.mockResolvedValue({
      current: [{ id: "11111111-1111-4111-8111-111111111111", solverId: "alpha", revision: 2,
        programHash: `0x${"33".repeat(32)}`, presentationState: "current", objective: null }],
      history: [{ id: "22222222-2222-4222-8222-222222222222", solverId: "alpha", revision: 1,
        programHash: `0x${"44".repeat(32)}`, presentationState: "superseded", objective: null,
        failureCodes: [] }],
    });

    const response = await GET(new Request(`https://cobia.example/api/intents/${intentId}`), context(intentId));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      intent: { id: intentId, displayGoal: "Supply USDG" },
      submissions: {
        current: [{ revision: 2, links: { program: "/programs/11111111-1111-4111-8111-111111111111" } }],
        history: [{ revision: 1, presentationState: "superseded" }],
      },
    });
  });

  it("rejects malformed intent ids before querying storage", async () => {
    const response = await GET(new Request("https://cobia.example/api/intents/nope"), context("nope"));
    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalledWith("nope");
  });
});
