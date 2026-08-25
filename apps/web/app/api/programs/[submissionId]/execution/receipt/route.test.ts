import { commitment } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PROTOCOL_REGISTRY } from "../../../../../../lib/adapters/registry";
import { buildCapabilityCompositionPolicyV1 } from "../../../../../../lib/intents/composition-policy";

const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(), getExecutionContext: vi.fn(), appendArtifact: vi.fn(), resolve: vi.fn(),
  createPublicClient: vi.fn(), deriveCapability: vi.fn(), deriveComposition: vi.fn(),
  prepareExecution: vi.fn(), validateReceipt: vi.fn(), assertReceipt: vi.fn(),
  readBalanceChanges: vi.fn(), readExecutionConfig: vi.fn(), finalizeFee: vi.fn(),
}));
vi.mock("../../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext,
    appendArtifact: mocks.appendArtifact, resolve: mocks.resolve }),
  getSolverSuccessFeeRepository: () => ({}),
}));
vi.mock("../../../../../../lib/env", () => ({
  readCodingAgentV3ExecutionConfig: mocks.readExecutionConfig,
}));
vi.mock("../../../../../../lib/open-exchange/capability-authority", () => ({
  deriveCapabilityAuthorityV2: mocks.deriveCapability,
}));
vi.mock("../../../../../../lib/open-exchange/composition-authority", () => ({
  deriveCompositionAuthorityV1: mocks.deriveComposition,
}));
vi.mock("../../../../../../lib/coding-agent-sandbox/agent-execution-v3", () => ({
  prepareAgentExecutionV3: mocks.prepareExecution,
}));
vi.mock("../../../../../../lib/coding-agent-sandbox/execution-receipt-v3", () => ({
  assertCanonicalAgentExecutionReceipt: mocks.assertReceipt,
  validateAgentExecutionReceiptV3: mocks.validateReceipt,
}));
vi.mock("../../../../../../lib/coding-agent-sandbox/confirmed-balance-changes", () => ({
  readConfirmedBalanceChanges: mocks.readBalanceChanges,
}));
vi.mock("../../../../../../lib/payments/launch-solver-success-fee", () => ({
  finalizeSolverSuccessFee: mocks.finalizeFee,
}));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(), createPublicClient: mocks.createPublicClient,
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111";
const context = { params: Promise.resolve({ submissionId }) };

describe("canonical program receipt access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readBalanceChanges.mockResolvedValue([]);
    mocks.finalizeFee.mockResolvedValue({ state: "waived" });
  });

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

  it("does not expose internal receipt-attribution failures", async () => {
    mocks.verifyProof.mockRejectedValue(z.string().safeParse(1).error);
    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {}, ownerSignature: `0x${"11".repeat(65)}`,
          transactionHash: `0x${"22".repeat(32)}`,
        }),
      },
    ), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "RECEIPT_UNAVAILABLE",
      message: "Could not attribute execution receipt.",
    });
  });

  it("rejects malformed receipt input before attribution", async () => {
    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: {}, ownerSignature: "not-a-signature" }),
      },
    ), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_REQUEST",
      message: "Execution receipt is invalid.",
    });
    expect(mocks.verifyProof).not.toHaveBeenCalled();
  });

  it("attributes a composition receipt with the same composition authority used for preparation", async () => {
    const inputToken = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
    const output = PROTOCOL_REGISTRY.aaveV3.assets.USDt0;
    const policy = buildCapabilityCompositionPolicyV1({ requestId: submissionId, owner,
      inputToken, inputAtomic: "1000000", nonce: `0x${"33".repeat(32)}`,
      nowSec: 2_000_000_000, displayGoal: "Best yield", competitionDurationSec: 300,
      deadlineDurationSec: 600, maxConversionLossBps: 100, minimumReceiptValueBps: 9_900,
      terminalAsset: output.underlying.address, horizonDays: 30, forbiddenTargets: [] });
    const program = { version: 2 as const, kind: "general-onchain" as const,
      requestId: submissionId, chainId: 196 as const, policyHash: `0x${"44".repeat(32)}`,
      manifestHash: policy.manifestHash, owner,
      executor: "0x3333333333333333333333333333333333333333",
      pinnedBlock: { number: "70000000", hash: `0x${"55".repeat(32)}` },
      deadline: policy.deadline, nonce: policy.nonce,
      input: { token: inputToken, atomic: "1000000" }, predicates: [],
      actions: [{ capabilityId: "curve-stableswap-ng.exact-input", capabilityVersion: 1,
        valueAtomic: "0", parameters: { tokenIn: inputToken, tokenOut: output.underlying.address,
          amountInAtomic: "1000000", minimumOutputAtomic: "999000" } },
      { capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0",
        parameters: { asset: output.underlying.address, amountAtomic: "999000" } }],
      balanceConstraints: [{ kind: "minimumIncrease" as const,
        token: output.aToken.address, atomic: "998999" }], objective: { kind: "satisfy" as const } };
    const hash = `0x${"66".repeat(32)}` as const;
    const blockHash = `0x${"77".repeat(32)}` as const;
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner,
      realm: "getcobia.com", expiresAt: policy.deadline });
    mocks.getExecutionContext.mockResolvedValue({ owner, solverId: "cobia-reference",
      policy, snapshot: { kind: "capability-composition" }, artifacts: [
        { kind: "program", payload: program, artifactHash: commitment(program) },
        { kind: "execution", payload: { version: 3 }, artifactHash: `0x${"88".repeat(32)}` },
      ] });
    mocks.deriveCapability.mockImplementation(() => { throw new Error("ordinary authority selected"); });
    mocks.deriveComposition.mockReturnValue({ policy: {}, snapshot: {} });
    mocks.readExecutionConfig.mockReturnValue({ COBIA_EXECUTOR_V3_ADDRESS: program.executor,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech" });
    mocks.prepareExecution.mockReturnValue({ execution: { data: "0x1234" },
      canonicalProgramHash: `0x${"99".repeat(32)}`, executionCommitment: `0x${"aa".repeat(32)}` });
    mocks.validateReceipt.mockReturnValue({ version: 3, transactionHash: hash,
      blockNumber: "70000001" });
    mocks.createPublicClient.mockReturnValue({
      getBlock: vi.fn(async (input?: { blockNumber?: bigint }) => ({ number: input?.blockNumber ?? 70_000_002n,
        hash: blockHash, timestamp: BigInt(policy.deadline - 1) })),
      getTransaction: vi.fn(async () => ({ hash, from: owner, to: program.executor,
        input: "0x1234", value: 0n })),
      getTransactionReceipt: vi.fn(async () => ({ transactionHash: hash, status: "success",
        blockNumber: 70_000_001n, blockHash, logs: [] })),
    });

    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/execution/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: {}, ownerSignature: `0x${"11".repeat(65)}`,
          transactionHash: hash }),
      },
    ), context);

    expect(response.status).toBe(200);
    expect(mocks.deriveComposition).toHaveBeenCalledWith(policy, expect.anything(),
      expect.objectContaining({ actions: program.actions }));
    expect(mocks.deriveCapability).not.toHaveBeenCalled();
  });
});
