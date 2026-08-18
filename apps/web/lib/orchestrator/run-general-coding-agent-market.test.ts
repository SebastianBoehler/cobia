import { commitment, type GeneralIntentPolicyV2, type GeneralIntentSnapshotV1 } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { runGeneralCodingAgentCompetition } from "./run-general-coding-agent-market";

const policy: GeneralIntentPolicyV2 = {
  version: 2, kind: "general-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Increase the verified Aave receipt balance",
  owner: "0x1111111111111111111111111111111111111111", executionChainId: 196,
  nonce: `0x${"11".repeat(32)}`, createdAt: 2_000_000_000, deadline: 2_000_001_800,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
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
const ownerSignature = `0x${"44".repeat(65)}` as const;

function repository() {
  return {
    intents: { create: vi.fn(async () => undefined) },
    profiles: { register: vi.fn(async () => undefined) },
    runs: { kind: "runs" }, submissions: { kind: "submissions" },
  };
}

describe("general coding-agent competition orchestration", () => {
  it("binds one signed intent, pinned state, portfolio, and solver revision", async () => {
    const repositories = repository();
    const coordinate = vi.fn(async () => ({
      status: "attested" as const, runId: "run-v3", submissionId: "program-v3",
    }));
    const result = await runGeneralCodingAgentCompetition({
      policy, ownerSignature, revision: 1, observedAtSec: 2_000_000_100,
    }, {
      repositories, assertReady: async () => undefined, captureSnapshot: async () => snapshot,
      capturePortfolio: async () => ({ balances: [], allowances: [], positions: [] }),
      manifest: { version: 1 }, executor: "0x4444444444444444444444444444444444444444",
      coordinate,
    } as never);

    expect(result).toMatchObject({ status: "attested", submissionId: "program-v3" });
    expect(repositories.intents.create).toHaveBeenCalledWith({ policy, ownerSignature });
    expect(repositories.profiles.register).toHaveBeenCalledWith(expect.objectContaining({
      id: "cobia-coding-agent", operatorKind: "internal",
    }));
    expect(coordinate).toHaveBeenCalledWith(expect.objectContaining({
      solverId: "cobia-coding-agent", revision: 1,
      validUntilSec: policy.competition.closesAt,
      job: expect.objectContaining({
        requestId: policy.requestId, policyHash: commitment(policy),
        snapshotHash: commitment(snapshot), manifestHash: policy.manifestHash,
      }),
    }), expect.objectContaining({ runs: repositories.runs, submissions: repositories.submissions }));
  });

  it("allows the solver to abstain without fabricating a submission", async () => {
    const repositories = repository();
    const coordinate = vi.fn(async () => ({ status: "abstained" as const, runId: "run-v3" }));
    await expect(runGeneralCodingAgentCompetition({
      policy, ownerSignature, revision: 1, observedAtSec: 2_000_000_100,
    }, {
      repositories, assertReady: async () => undefined, captureSnapshot: async () => snapshot,
      capturePortfolio: async () => ({ balances: [], allowances: [], positions: [] }),
      manifest: {}, executor: "0x4444444444444444444444444444444444444444", coordinate,
    } as never)).resolves.toEqual({ status: "abstained", runId: "run-v3" });
  });

  it("fails before persistence or sandbox work when the executor is unavailable", async () => {
    const repositories = repository();
    const coordinate = vi.fn();
    await expect(runGeneralCodingAgentCompetition({
      policy, ownerSignature, revision: 1, observedAtSec: 2_000_000_100,
    }, {
      repositories, assertReady: async () => { throw new Error("Atomic execution is paused"); },
      captureSnapshot: vi.fn(), capturePortfolio: vi.fn(), manifest: {},
      executor: "0x4444444444444444444444444444444444444444", coordinate,
    } as never)).rejects.toThrow("Atomic execution is paused");

    expect(repositories.intents.create).not.toHaveBeenCalled();
    expect(repositories.profiles.register).not.toHaveBeenCalled();
    expect(coordinate).not.toHaveBeenCalled();
  });
});
