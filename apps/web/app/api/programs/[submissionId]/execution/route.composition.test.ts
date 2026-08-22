import { commitment } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_REGISTRY } from "../../../../../lib/adapters/registry";
import { buildCapabilityCompositionPolicyV1 } from "../../../../../lib/intents/composition-policy";

const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(), getExecutionContext: vi.fn(), deriveAuthority: vi.fn(),
  prepareExecution: vi.fn(), readExecutionConfig: vi.fn(),
  assertExecutorReady: vi.fn(), createPublicClient: vi.fn(),
}));

vi.mock("../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
  getSolverProfileRepository: () => ({}), getSolverSuccessFeeRepository: () => ({}),
}));
vi.mock("../../../../../lib/env", () => ({
  readCodingAgentV3ExecutionConfig: mocks.readExecutionConfig,
}));
vi.mock("../../../../../lib/open-exchange/composition-authority", () => ({
  deriveCompositionAuthorityV1: mocks.deriveAuthority,
}));
vi.mock("../../../../../lib/coding-agent-sandbox/agent-execution-v3", () => ({
  exactApprovalCalls: vi.fn(() => []), prepareAgentExecutionV3: mocks.prepareExecution,
}));
vi.mock("../../../../../lib/coding-agent-sandbox/executor-preflight", () => ({
  assertAgentExecutorReadyV1: mocks.assertExecutorReady,
  createAgentExecutorReadV1: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(), createPublicClient: mocks.createPublicClient,
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111";

describe("composition program execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("projects an attested composition program through Executor V3", async () => {
    const inputToken = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
    const policy = buildCapabilityCompositionPolicyV1({
      requestId: submissionId, owner, inputToken, inputAtomic: "1000000",
      nonce: `0x${"33".repeat(32)}`, nowSec: 2_000_000_000,
      displayGoal: "Best yield", competitionDurationSec: 300, deadlineDurationSec: 600,
      maxConversionLossBps: 100, minimumReceiptValueBps: 9_900,
      terminalAsset: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
      horizonDays: 30, forbiddenTargets: [],
    });
    const program = { version: 2 as const, kind: "general-onchain" as const,
      requestId: submissionId, chainId: 196 as const, policyHash: `0x${"44".repeat(32)}`,
      manifestHash: policy.manifestHash, owner,
      executor: "0x3333333333333333333333333333333333333333",
      pinnedBlock: { number: "70000000", hash: `0x${"55".repeat(32)}` },
      deadline: policy.deadline, nonce: policy.nonce,
      input: { token: inputToken, atomic: "1000000" },
      actions: [{ capabilityId: "curve-stableswap-ng.exact-input", capabilityVersion: 1,
        valueAtomic: "0", parameters: { tokenIn: inputToken,
          tokenOut: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
          amountInAtomic: "1000000", minimumOutputAtomic: "999000" } },
      { capabilityId: "aave-v3.supply", capabilityVersion: 1,
        valueAtomic: "0", parameters: {
          asset: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
          amountAtomic: "999000",
        } }],
      balanceConstraints: [{ kind: "minimumIncrease",
        token: PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address, atomic: "998999" }],
      predicates: [], objective: { kind: "satisfy" },
    };
    const execution = { version: 3, program: { deadline: String(policy.deadline) } };
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner,
      realm: "getcobia.com", expiresAt: policy.competition.closesAt });
    mocks.getExecutionContext.mockResolvedValue({ owner, solverId: "cobia-reference",
      state: "attested", policy, snapshot: { kind: "capability-composition" },
      artifacts: [
        { kind: "program", payload: program, artifactHash: commitment(program) },
        { kind: "execution", payload: execution, artifactHash: commitment(execution) },
      ] });
    mocks.deriveAuthority.mockReturnValue({ policy: {}, snapshot: {} });
    mocks.prepareExecution.mockReturnValue({ approval: { to: inputToken },
      inputAmountAtomic: "1000000", execution: {} });
    mocks.readExecutionConfig.mockReturnValue({
      COBIA_EXECUTOR_V3_ADDRESS: program.executor,
      COBIA_EXECUTOR_V3_CODE_HASH: `0x${"22".repeat(32)}`,
      COBIA_VERIFIER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    });
    mocks.createPublicClient.mockReturnValue({ readContract: vi.fn()
      .mockResolvedValueOnce(1_000_000n).mockResolvedValueOnce(1_000_000n) });
    mocks.assertExecutorReady.mockResolvedValue(undefined);

    const request = new Request(`https://getcobia.com/api/programs/${submissionId}/execution`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: {}, ownerSignature: `0x${"11".repeat(65)}` }),
    });
    const response = await POST(request, { params: Promise.resolve({ submissionId }) });

    expect(response.status).toBe(200);
    expect(mocks.deriveAuthority).toHaveBeenCalledWith(policy, expect.anything(),
      expect.objectContaining({ actions: program.actions }));
    await expect(response.json()).resolves.toMatchObject({
      chainId: 196, programVersion: 3, successFee: { state: "waived" },
    });
  });
});
