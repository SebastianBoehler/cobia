import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(),
  getExecutionContext: vi.fn(),
}));

vi.mock("../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111";
const signature = `0x${"11".repeat(65)}`;
const context = { params: Promise.resolve({ submissionId }) };

function request() {
  return new Request(`https://getcobia.com/api/programs/${submissionId}/execution`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof: {}, ownerSignature: signature }),
  });
}

describe("canonical program execution access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a proof bound to any other immutable submission", async () => {
    mocks.verifyProof.mockResolvedValue({
      programId: "550e8400-e29b-41d4-a716-446655440099", owner, realm: "getcobia.com",
    });
    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_PROOF" });
    expect(mocks.getExecutionContext).not.toHaveBeenCalled();
  });

  it("does not disclose a program when the signed proof owner differs", async () => {
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner, realm: "getcobia.com" });
    mocks.getExecutionContext.mockResolvedValue({
      owner: "0x2222222222222222222222222222222222222222",
    });
    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not expose internal execution failures", async () => {
    mocks.verifyProof.mockRejectedValue(new Error("DATABASE_URL contains secret-host"));

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "EXECUTION_UNAVAILABLE",
      message: "Program execution is unavailable.",
    });
  });
});
