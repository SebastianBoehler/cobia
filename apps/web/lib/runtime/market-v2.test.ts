import type { StablecoinPolicyV2 } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requests: { kind: "requests" },
  programs: { kind: "programs" },
  openCodingAgentMarketV2: vi.fn(async () => ({ jobId: "job-1" })),
}));

vi.mock("../db/client", () => ({ createDatabase: () => ({ db: { kind: "test-db" } }) }));
vi.mock("../db/requests", () => ({ createRequestRepository: () => mocks.requests }));
vi.mock("../db/agent-programs", () => ({ createAgentProgramRepository: () => mocks.programs }));
vi.mock("../env", () => ({
  readDatabaseUrl: () => "postgresql://test:test@localhost:5432/cobia",
}));
vi.mock("./coding-agent", () => ({
  openCodingAgentMarketV2: mocks.openCodingAgentMarketV2,
}));

import { openQuoteMarket } from "./market";

const policy: StablecoinPolicyV2 = {
  version: 2,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  principalAtomic: "25000000000",
  protocolExposureBps: 4_000,
  minTvlUsdE6: "500000000000",
  minPreGasApyBps: 5,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
  allowedOutputAssets: [
    "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  ],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 50,
  horizonDays: 30,
};

describe("V2 market runtime", () => {
  it("uses only the open coding-agent path with no deterministic fallback", async () => {
    await expect(openQuoteMarket(policy)).resolves.toEqual({ jobId: "job-1" });
    expect(mocks.openCodingAgentMarketV2).toHaveBeenCalledWith(policy, {
      requests: mocks.requests,
      programs: mocks.programs,
    });
  });
});
