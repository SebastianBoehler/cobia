import { commitment } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(),
  getExecutionContext: vi.fn(),
  prepareStage: vi.fn(),
}));

vi.mock("../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
  getGeneralAssetExecutionRepository: () => ({ prepareStage: mocks.prepareStage }),
  getSolverProfileRepository: vi.fn(),
  getSolverSuccessFeeRepository: vi.fn(),
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const executor = "0x4444444444444444444444444444444444444444" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const context = { params: Promise.resolve({ submissionId }) };

function bundle() {
  return {
    version: 4 as const, kind: "general-asset-execution" as const, programId: hash("1"),
    owner, deadline: 2_000_000_300,
    finalOutput: { chainId: 196 as const, token: outputToken, minimumAtomic: "90" },
    stages: [{ stageId: hash("2"), ordinal: 0, chainId: 196 as const,
      predecessorStageId: null, inputToken, requiredConfirmations: 12,
      transaction: { chainId: 196 as const, from: owner, to: executor, nonce: "7",
        value: "0x0" as const, data: "0x12345678" as const },
      expectedLogs: [{ address: executor, topics: [hash("3")], data: "0x" as const }],
      delivery: { kind: "none" as const }, evidenceHash: hash("4") }],
  };
}

describe("general asset program execution review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prepares only the first exact stage and returns ordered attested review data", async () => {
    const execution = bundle();
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner, realm: "getcobia.com" });
    mocks.getExecutionContext.mockResolvedValue({ owner, state: "attested", artifacts: [{
      kind: "execution", payload: execution, artifactHash: commitment(execution),
    }] });
    mocks.prepareStage.mockResolvedValue({ state: "prepared" });

    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/execution`,
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ proof: {}, ownerSignature: `0x${"11".repeat(65)}` }) },
    ), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      programVersion: 4, programId: execution.programId, state: "prepared",
      stages: [{ stageId: execution.stages[0].stageId, chainId: 196, state: "prepared",
        transaction: { to: executor, data: "0x12345678", value: "0x0" } }],
    });
    expect(mocks.prepareStage).toHaveBeenCalledTimes(1);
  });
});
