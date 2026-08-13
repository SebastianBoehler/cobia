import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { createRepositoryFixtureV2 } from "../db/repository-test-fixtures";
import { runCodingAgentMarketV2 } from "./run-coding-agent-market-v2";

describe("coding-agent market orchestration", () => {
  it("captures one pinned state and returns an independently attested program", async () => {
    const fixture = await createRepositoryFixtureV2();
    const repository = {
      createRequest: vi.fn(async () => undefined), saveSnapshot: vi.fn(async () => undefined),
      finishMarket: vi.fn(async () => undefined), failRequest: vi.fn(async () => undefined),
    };
    const coordinate = vi.fn(async () => ({ jobId: "job-1", authorization: { signature: "0x" } }));
    const result = await runCodingAgentMarketV2(fixture.policy, {
      repository,
      captureSnapshot: async () => fixture.snapshot,
      capturePortfolio: async () => ({ balances: [], allowances: [], positions: [] }),
      manifest: { registryHash: fixture.snapshot.adapterRegistryHash },
      executor: "0x2222222222222222222222222222222222222222",
      coordinate,
    });

    expect(result).toMatchObject({ jobId: "job-1" });
    expect(coordinate).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({
        requestId: fixture.policy.requestId,
        policyHash: commitment(fixture.policy),
        snapshotHash: commitment(fixture.snapshot),
      }),
      policy: fixture.policy,
      snapshot: fixture.snapshot,
    }), undefined);
    expect(repository.finishMarket).toHaveBeenCalledWith(fixture.policy.requestId, "agent_ready");
  });

  it("fails the request without creating a fallback quote", async () => {
    const fixture = await createRepositoryFixtureV2();
    const repository = {
      createRequest: vi.fn(async () => undefined), saveSnapshot: vi.fn(async () => undefined),
      finishMarket: vi.fn(async () => undefined), failRequest: vi.fn(async () => undefined),
    };
    await expect(runCodingAgentMarketV2(fixture.policy, {
      repository, captureSnapshot: async () => { throw new Error("RPC unavailable"); },
      capturePortfolio: vi.fn(), manifest: {},
      executor: "0x2222222222222222222222222222222222222222",
      coordinate: vi.fn(),
    })).rejects.toThrow("RPC unavailable");
    expect(repository.failRequest).toHaveBeenCalledWith(fixture.policy.requestId);
    expect(repository.finishMarket).not.toHaveBeenCalled();
  });
});
