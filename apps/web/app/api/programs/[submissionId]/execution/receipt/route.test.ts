import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyProof: vi.fn(), getExecutionContext: vi.fn() }));
vi.mock("../../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111";
const context = { params: Promise.resolve({ submissionId }) };

describe("canonical program receipt access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a receipt proof from a different browser realm before any RPC read", async () => {
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner, realm: "evil.example" });
    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {}, ownerSignature: `0x${"11".repeat(65)}`,
          transactionHash: `0x${"22".repeat(32)}`,
        }),
      },
    ), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_PROOF" });
    expect(mocks.getExecutionContext).not.toHaveBeenCalled();
  });
});
