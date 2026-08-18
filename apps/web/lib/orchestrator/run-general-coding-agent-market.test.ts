import { commitment, type GeneralIntentPolicyV1, type GeneralIntentSnapshotV1 } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { runGeneralCodingAgentMarketV1 } from "./run-general-coding-agent-market";

const policy: GeneralIntentPolicyV1 = {
  version: 1, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111", executionChainId: 196,
  nonce: `0x${"11".repeat(32)}`, createdAt: 2_000_000_000, deadline: 2_000_001_800,
  maxEvidenceAgeSec: 300, manifestHash: `0x${"22".repeat(32)}`,
  input: { token: "0x2222222222222222222222222222222222222222", maxAtomic: "10000000" },
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  limits: { maxActions: 2, maxApprovals: 2, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
  balanceConstraints: [{ kind: "minimumIncrease", token: "0x3333333333333333333333333333333333333333", atomic: "9950000" }],
  predicates: [], objective: { kind: "satisfy" },
};
const snapshot: GeneralIntentSnapshotV1 = {
  version: 1, kind: "general-onchain", requestId: policy.requestId, chainId: 196,
  blockNumber: "123", blockHash: `0x${"33".repeat(32)}`,
  capturedAt: "2033-05-18T03:33:20.000Z", manifestHash: policy.manifestHash,
};

describe("general coding-agent market orchestration", () => {
  it("binds the signed policy, pinned state, portfolio, and V3 executor into one job", async () => {
    const repository = {
      createRequest: vi.fn(async () => undefined), saveSnapshot: vi.fn(async () => undefined),
      finishMarket: vi.fn(async () => undefined), failRequest: vi.fn(async () => undefined),
    };
    const coordinate = vi.fn(async () => ({ jobId: "job-v3" }));
    const result = await runGeneralCodingAgentMarketV1(policy, {
      repository, assertReady: async () => undefined, captureSnapshot: async () => snapshot,
      capturePortfolio: async () => ({ balances: [], allowances: [], positions: [] }),
      manifest: { version: 1 }, executor: "0x4444444444444444444444444444444444444444",
      coordinate,
    });

    expect(result).toEqual({ jobId: "job-v3" });
    expect(coordinate).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({
        requestId: policy.requestId,
        policyHash: commitment(policy),
        snapshotHash: commitment(snapshot),
        manifestHash: policy.manifestHash,
      }),
      policy, snapshot,
      executor: "0x4444444444444444444444444444444444444444",
    }), undefined);
    expect(repository.finishMarket).toHaveBeenCalledWith(policy.requestId, "agent_ready");
  });

  it("records failure and never fabricates a fallback program", async () => {
    const repository = {
      createRequest: vi.fn(async () => undefined), saveSnapshot: vi.fn(async () => undefined),
      finishMarket: vi.fn(async () => undefined), failRequest: vi.fn(async () => undefined),
    };
    await expect(runGeneralCodingAgentMarketV1(policy, {
      repository, captureSnapshot: async () => { throw new Error("anchor unavailable"); },
      assertReady: async () => undefined,
      capturePortfolio: vi.fn(), manifest: {},
      executor: "0x4444444444444444444444444444444444444444", coordinate: vi.fn(),
    })).rejects.toThrow("anchor unavailable");
    expect(repository.failRequest).toHaveBeenCalledWith(policy.requestId);
    expect(repository.finishMarket).not.toHaveBeenCalled();
  });

  it("fails before persistence or sandbox work when the mainnet executor is unavailable", async () => {
    const repository = {
      createRequest: vi.fn(async () => undefined), saveSnapshot: vi.fn(async () => undefined),
      finishMarket: vi.fn(async () => undefined), failRequest: vi.fn(async () => undefined),
    };
    const captureSnapshot = vi.fn(async () => snapshot);
    const coordinate = vi.fn(async () => ({ jobId: "must-not-run" }));

    await expect(runGeneralCodingAgentMarketV1(policy, {
      repository,
      assertReady: async () => { throw new Error("Atomic execution is paused"); },
      captureSnapshot,
      capturePortfolio: vi.fn(),
      manifest: {}, executor: "0x4444444444444444444444444444444444444444", coordinate,
    })).rejects.toThrow("Atomic execution is paused");

    expect(repository.createRequest).not.toHaveBeenCalled();
    expect(repository.failRequest).not.toHaveBeenCalled();
    expect(captureSnapshot).not.toHaveBeenCalled();
    expect(coordinate).not.toHaveBeenCalled();
  });
});
