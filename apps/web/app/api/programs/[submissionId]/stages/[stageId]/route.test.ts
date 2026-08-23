import { commitment } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const mocks = vi.hoisted(() => ({
  verifyProof: vi.fn(),
  getExecutionContext: vi.fn(),
  prepareStage: vi.fn(),
  armStage: vi.fn(),
  recordSubmission: vi.fn(),
  getProgram: vi.fn(),
  reconcileLive: vi.fn(),
  revalidate: vi.fn(),
  createBridgeMonitor: vi.fn(),
}));

vi.mock("../../../../../../lib/coding-agent-sandbox/execution-access", () => ({
  verifyAgentExecutionAccessProof: mocks.verifyProof,
}));
vi.mock("../../../../../../lib/runtime/market", () => ({
  getSolverSubmissionRepository: () => ({ getExecutionContext: mocks.getExecutionContext }),
  getGeneralAssetExecutionRepository: () => ({
    prepareStage: (...args: unknown[]) => { calls.push("prepare"); return mocks.prepareStage(...args); },
    armStage: (...args: unknown[]) => { calls.push("arm"); return mocks.armStage(...args); },
    recordSubmission: mocks.recordSubmission,
    getProgram: mocks.getProgram,
  }),
}));
vi.mock("../../../../../../lib/execution-v4/live-stage-reconciliation", () => ({
  createGeneralAssetStageChainReaderV4: vi.fn(() => ({})),
  reconcileGeneralAssetStageLiveV4: mocks.reconcileLive,
}));
vi.mock("../../../../../../lib/execution-v4/production-stage-revalidation", () => ({
  revalidateProductionStageEvidenceV4: (...args: unknown[]) => {
    calls.push("revalidate"); return mocks.revalidate(...args);
  },
}));
vi.mock("../../../../../../lib/execution-v4/production-bridge-delivery", () => ({
  createProductionBridgeDeliveryMonitorV4: mocks.createBridgeMonitor,
}));

import { POST } from "./route";

const submissionId = "550e8400-e29b-41d4-a716-446655440020";
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const executor = "0x4444444444444444444444444444444444444444" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const stageId = hash("2");
const destinationStageId = hash("5");
const context = { params: Promise.resolve({ submissionId, stageId }) };

function bundle() {
  return {
    version: 4 as const, kind: "general-asset-execution" as const, programId: hash("1"),
    owner, deadline: 2_000_000_300,
    finalOutput: { chainId: 196 as const, token: outputToken, minimumAtomic: "90" },
    stages: [{ stageId, ordinal: 0, chainId: 196 as const, predecessorStageId: null,
      inputToken, requiredConfirmations: 12,
      transaction: { chainId: 196 as const, from: owner, to: executor, nonce: "7",
        value: "0x0" as const, data: "0x12345678" as const },
      expectedLogs: [{ address: executor, topics: [hash("3")], data: "0x" as const }],
      delivery: { kind: "none" as const }, evidenceHash: hash("4") }],
  };
}

function request(body: Record<string, unknown>) {
  return new Request(`https://getcobia.com/api/programs/${submissionId}/stages/${stageId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ proof: {}, ownerSignature: `0x${"11".repeat(65)}`, ...body }),
  });
}

function crossChainBundle() {
  const execution = bundle();
  const destinationInput = "0x5555555555555555555555555555555555555555" as const;
  return { ...execution, finalOutput: { chainId: 1 as const, token: outputToken, minimumAtomic: "80" },
    stages: [
      { ...execution.stages[0], delivery: { kind: "bridge" as const,
        destinationChainId: 1 as const, recipient: owner, token: destinationInput,
        minimumAtomic: "85" } },
      { stageId: destinationStageId, ordinal: 1, chainId: 1 as const,
        predecessorStageId: stageId, inputToken: destinationInput, requiredConfirmations: 12,
        transaction: { chainId: 1 as const, from: owner, to: executor, nonce: "8",
          value: "0x0" as const, data: "0x87654321" as const },
        expectedLogs: [{ address: executor, topics: [hash("6")], data: "0x" as const }],
        delivery: { kind: "none" as const }, evidenceHash: hash("7") },
    ] };
}

describe("general asset stage API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); calls.length = 0;
    const execution = bundle();
    mocks.verifyProof.mockResolvedValue({ programId: submissionId, owner, realm: "getcobia.com" });
    mocks.getExecutionContext.mockResolvedValue({ owner, state: "attested",
      policy: { kind: "general-asset" }, program: {}, artifacts: [{
      kind: "execution", payload: execution, artifactHash: commitment(execution),
    }] });
    mocks.revalidate.mockResolvedValue({});
    mocks.createBridgeMonitor.mockReturnValue({ monitor: true });
  });

  it("durably arms the canonical stage before returning its exact wallet transaction", async () => {
    mocks.prepareStage.mockResolvedValue({ state: "prepared" });
    mocks.armStage.mockResolvedValue({ state: "broadcasting" });
    mocks.reconcileLive.mockResolvedValue({ state: "delivered" });

    const response = await POST(request({ action: "arm" }), context);

    expect(response.status).toBe(200);
    expect(calls).toEqual(["prepare", "revalidate", "arm"]);
    await expect(response.json()).resolves.toMatchObject({
      state: "broadcasting", stageId, transaction: bundle().stages[0].transaction,
    });
  });

  it("records only a canonical transaction hash for an armed stage", async () => {
    mocks.recordSubmission.mockResolvedValue({ state: "submitted", transactionHash: hash("9") });

    const response = await POST(request({ action: "submitted", transactionHash: hash("9") }), context);

    expect(response.status).toBe(200);
    expect(mocks.recordSubmission).toHaveBeenCalledWith(bundle().programId, stageId, hash("9"));
    await expect(response.json()).resolves.toMatchObject({ state: "submitted", stageId });
  });

  it("revalidates the exact destination stage after predecessor checks and before arming", async () => {
    const execution = crossChainBundle();
    const program = { marker: "destination-program" };
    mocks.getExecutionContext.mockResolvedValue({ owner, state: "attested",
      policy: { kind: "general-asset" }, program, artifacts: [{
        kind: "execution", payload: execution, artifactHash: commitment(execution),
      }] });
    mocks.prepareStage.mockResolvedValue({ state: "prepared" });
    mocks.armStage.mockResolvedValue({ state: "broadcasting" });

    const response = await POST(new Request(
      `https://getcobia.com/api/programs/${submissionId}/stages/${destinationStageId}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        proof: {}, ownerSignature: `0x${"11".repeat(65)}`, action: "arm",
      }) },
    ), { params: Promise.resolve({ submissionId, stageId: destinationStageId }) });

    expect(response.status).toBe(200);
    expect(calls).toEqual(["prepare", "revalidate", "arm"]);
    expect(mocks.revalidate).toHaveBeenCalledWith(expect.objectContaining({
      stageId: destinationStageId, program,
    }));
    expect(mocks.reconcileLive).toHaveBeenCalledWith(expect.objectContaining({
      stageId, bridge: { monitor: true },
    }));
  });

  it("never arms a prepared stage when fresh evidence fails", async () => {
    mocks.prepareStage.mockResolvedValue({ state: "prepared" });
    mocks.revalidate.mockRejectedValue(new Error("Target runtime drift"));

    const response = await POST(request({ action: "arm" }), context);

    expect(response.status).toBe(409);
    expect(calls).toEqual(["prepare", "revalidate"]);
    expect(mocks.armStage).not.toHaveBeenCalled();
  });

  it("does not expose a stage outside the attested artifact", async () => {
    const response = await POST(request({ action: "arm" }), {
      params: Promise.resolve({ submissionId, stageId: hash("8") }),
    });
    expect(response.status).toBe(404);
    expect(mocks.armStage).not.toHaveBeenCalled();
  });

  it("reconciles submitted stages only from the server chain reader", async () => {
    mocks.reconcileLive.mockResolvedValue({ state: "confirmed" });

    const response = await POST(request({ action: "reconcile" }), context);

    expect(response.status).toBe(200);
    expect(mocks.reconcileLive).toHaveBeenCalledWith(expect.objectContaining({
      bundle: bundle(), stageId, reader: {},
    }));
    await expect(response.json()).resolves.toMatchObject({ stageId, state: "confirmed" });
  });

  it("uses the committed registered bridge monitor when reconciling a bridge stage", async () => {
    const execution = crossChainBundle();
    const program = { marker: "bridge-program" };
    mocks.getExecutionContext.mockResolvedValue({ owner, state: "attested",
      policy: { kind: "general-asset" }, program, artifacts: [{
        kind: "execution", payload: execution, artifactHash: commitment(execution),
      }] });
    mocks.reconcileLive.mockResolvedValue({ state: "delivered" });

    const response = await POST(request({ action: "reconcile" }), context);

    expect(response.status).toBe(200);
    expect(mocks.createBridgeMonitor).toHaveBeenCalledWith(expect.objectContaining({
      stageId, program,
    }));
    expect(mocks.reconcileLive).toHaveBeenCalledWith(expect.objectContaining({
      stageId, bridge: { monitor: true },
    }));
  });
});
