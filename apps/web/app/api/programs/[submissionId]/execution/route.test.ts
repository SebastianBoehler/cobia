import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitment, OpenIntentPolicyV3Schema } from "@cobia/domain";

const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(),
  getExecutionContext: vi.fn(),
  profileIdentity: vi.fn(),
  readPaymentConfig: vi.fn(),
  readExecutionConfig: vi.fn(),
  deriveAuthority: vi.fn(),
  prepareExecution: vi.fn(),
  assertExecutorReady: vi.fn(),
  createPublicClient: vi.fn(),
}));

vi.mock("../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
  getSolverProfileRepository: () => ({ identity: mocks.profileIdentity }),
}));
vi.mock("../../../../../lib/payments/config", () => ({ readPaymentConfig: mocks.readPaymentConfig }));
vi.mock("../../../../../lib/env", () => ({
  readCodingAgentV3ExecutionConfig: mocks.readExecutionConfig,
}));
vi.mock("../../../../../lib/open-exchange/capability-authority", () => ({
  deriveCapabilityAuthorityV2: mocks.deriveAuthority,
}));
vi.mock("../../../../../lib/coding-agent-sandbox/agent-execution-v3", () => ({
  exactApprovalCalls: vi.fn(),
  prepareAgentExecutionV3: mocks.prepareExecution,
}));
vi.mock("../../../../../lib/coding-agent-sandbox/executor-preflight", () => ({
  assertAgentExecutorReadyV1: mocks.assertExecutorReady,
  createAgentExecutorReadV1: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: mocks.createPublicClient,
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

  it("checks executor readiness before requesting a success-fee credential", async () => {
    const execution = { version: 3, program: { deadline: "2000001000" } };
    const policy = OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: submissionId, displayGoal: "Swap USDG",
      owner, executionChainIds: [196], nonce: `0x${"33".repeat(32)}`,
      createdAt: 2_000_000_000, deadline: 2_000_001_000,
      competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 1 }, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222", maximumAtomic: "1000000" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: "0x3333333333333333333333333333333333333333", atomic: "1" }],
      limits: {
        maxStages: 1, maxTransactions: 1, maxApprovals: 1, maxCalldataBytes: 4,
        maxGasPerTransaction: "1", maxSolverFeeAtomic: "100000",
        maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }],
      },
      forbiddenTargets: [], forbiddenAssets: [],
    });
    mocks.verifyProof.mockResolvedValue({
      programId: submissionId, owner, realm: "getcobia.com", expiresAt: 2_000_000_300,
    });
    mocks.getExecutionContext.mockResolvedValue({
      owner, solverId: "cobia-reference", state: "attested", policy, snapshot: {},
      artifacts: [{ kind: "execution", payload: execution, artifactHash: commitment(execution) }],
    });
    mocks.deriveAuthority.mockReturnValue({ policy: {}, snapshot: {} });
    mocks.prepareExecution.mockReturnValue({
      approval: { to: "0x2222222222222222222222222222222222222222" },
      inputAmountAtomic: "1000000",
    });
    mocks.readExecutionConfig.mockReturnValue({
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"22".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    });
    mocks.createPublicClient.mockReturnValue({ readContract: vi.fn() });
    mocks.assertExecutorReady.mockRejectedValue(new Error("Atomic execution is paused"));

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "EXECUTION_UNAVAILABLE", message: "Program execution is unavailable.",
    });
    expect(mocks.assertExecutorReady).toHaveBeenCalledTimes(1);
    expect(mocks.profileIdentity).not.toHaveBeenCalled();
    expect(mocks.readPaymentConfig).not.toHaveBeenCalled();
  });

  it("refuses wallet preparation when the owner cannot fund the signed input", async () => {
    const inputToken = "0x2222222222222222222222222222222222222222";
    const execution = { version: 3, program: { deadline: "2000001000" } };
    const policy = OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: submissionId, displayGoal: "Swap USDG",
      owner, executionChainIds: [196], nonce: `0x${"33".repeat(32)}`,
      createdAt: 2_000_000_000, deadline: 2_000_001_000,
      competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 1 }, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: inputToken, maximumAtomic: "1000000" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: "0x3333333333333333333333333333333333333333", atomic: "1" }],
      limits: { maxStages: 1, maxTransactions: 1, maxApprovals: 1, maxCalldataBytes: 4,
        maxGasPerTransaction: "1", maxSolverFeeAtomic: "100000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
      forbiddenTargets: [], forbiddenAssets: [],
    });
    mocks.verifyProof.mockResolvedValue({
      programId: submissionId, owner, realm: "getcobia.com", expiresAt: 2_000_000_300,
    });
    mocks.getExecutionContext.mockResolvedValue({
      owner, solverId: "cobia-reference", state: "attested", policy,
      snapshot: { tokenEvidence: [{ token: inputToken, symbol: "USDG", decimals: 6 }] },
      artifacts: [{ kind: "execution", payload: execution, artifactHash: commitment(execution) }],
    });
    mocks.deriveAuthority.mockReturnValue({ policy: {}, snapshot: {} });
    mocks.prepareExecution.mockReturnValue({
      approval: { to: inputToken }, inputAmountAtomic: "1000000",
    });
    mocks.readExecutionConfig.mockReturnValue({
      COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"22".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    });
    mocks.createPublicClient.mockReturnValue({
      readContract: vi.fn()
        .mockResolvedValueOnce(81_460n)
        .mockResolvedValueOnce(1_000_000n),
    });
    mocks.assertExecutorReady.mockResolvedValue(undefined);

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "INPUT_BALANCE_INSUFFICIENT",
      message: "Wallet needs 1 USDG but only holds 0.08146 USDG.",
      inputToken,
      requiredAtomic: "1000000",
      availableAtomic: "81460",
    });
    expect(mocks.profileIdentity).not.toHaveBeenCalled();
    expect(mocks.readPaymentConfig).not.toHaveBeenCalled();
  });

  it("identifies a closed verified execution window without exposing internal details", async () => {
    const execution = { version: 3, program: { deadline: "1" } };
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner, realm: "getcobia.com" });
    mocks.getExecutionContext.mockResolvedValue({
      owner, solverId: "cobia-reference", state: "attested",
      artifacts: [{ kind: "execution", payload: execution, artifactHash: commitment(execution) }],
    });
    mocks.profileIdentity.mockResolvedValue({
      attestationAddress: "0x2222222222222222222222222222222222222222",
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "EXECUTION_EXPIRED",
      message: "The verified execution window has closed. Create a fresh intent.",
    });
  });

  it("prepares an existing signed program without payment while launch fees are waived", async () => {
    const execution = {
      version: 1, kind: "wallet-call-batch", owner, deadline: 2_000_001_000,
      assurance: "exact-call-fork-replay",
      stages: [{ stageId: "swap", chainId: 196, calls: [{
        to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0",
      }] }],
    };
    const policy = OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: submissionId, displayGoal: "Swap USDG",
      owner, executionChainIds: [196], nonce: `0x${"33".repeat(32)}`,
      createdAt: 2_000_000_000, deadline: 2_000_001_000,
      competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 1 }, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: "0x3333333333333333333333333333333333333333", maximumAtomic: "1" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: "0x2222222222222222222222222222222222222222", atomic: "1" }],
      limits: { maxStages: 1, maxTransactions: 1, maxApprovals: 0, maxCalldataBytes: 4,
        maxGasPerTransaction: "1", maxSolverFeeAtomic: "100000",
        maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
      forbiddenTargets: [], forbiddenAssets: [],
    });
    mocks.verifyProof.mockResolvedValue({
      programId: submissionId, owner, realm: "getcobia.com", expiresAt: 2_000_000_300,
    });
    mocks.getExecutionContext.mockResolvedValue({
      owner, solverId: "cobia-reference", state: "attested", policy, artifacts: [{
        kind: "execution", payload: execution, artifactHash: commitment(execution),
      }],
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      chainId: 196, transactions: execution.stages[0].calls,
      successFee: { amountAtomic: "0", state: "waived" },
    });
    expect(mocks.profileIdentity).not.toHaveBeenCalled();
    expect(mocks.readPaymentConfig).not.toHaveBeenCalled();
  });

  it("never returns wallet calls for a transaction program that is not attested", async () => {
    const execution = {
      version: 1, kind: "wallet-call-batch", owner, deadline: 2_000_001_000,
      assurance: "exact-call-fork-replay",
      stages: [{ stageId: "swap", chainId: 196, calls: [{
        to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0x0",
      }] }],
    };
    const policy = OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: submissionId, displayGoal: "Swap USDG",
      owner, executionChainIds: [196], nonce: `0x${"33".repeat(32)}`,
      createdAt: 2_000_000_000, deadline: 2_000_001_000,
      competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 1 }, maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 196, token: "0x3333333333333333333333333333333333333333", maximumAtomic: "1" }],
      outcomes: [{ kind: "minimum-increase", chainId: 196,
        token: "0x2222222222222222222222222222222222222222", atomic: "1" }],
      limits: { maxStages: 1, maxTransactions: 1, maxApprovals: 0, maxCalldataBytes: 4,
        maxGasPerTransaction: "1", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
      forbiddenTargets: [], forbiddenAssets: [],
    });
    mocks.verifyProof.mockResolvedValue({
      programId: submissionId, owner, realm: "getcobia.com", expiresAt: 2_000_000_300,
    });
    mocks.getExecutionContext.mockResolvedValue({ owner, solverId: "cobia-agentic",
      state: "proposed", policy, artifacts: [{ kind: "execution", payload: execution,
        artifactHash: commitment(execution) }] });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "EXECUTION_UNAVAILABLE", message: "Program execution is unavailable.",
    });
  });

});
