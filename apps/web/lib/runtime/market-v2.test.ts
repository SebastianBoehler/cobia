import type { StablecoinPolicyV2 } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registryHash } from "../adapters/registry";

const mocks = vi.hoisted(() => {
  const repository = {
    createRequest: vi.fn(async () => undefined),
    saveSnapshot: vi.fn(async () => undefined),
    saveQuote: vi.fn(async () => undefined),
    finishMarket: vi.fn(async () => undefined),
    failRequest: vi.fn(async () => undefined),
  };
  return {
    repository,
    captureRouteSnapshotV2: vi.fn(async () => ({ snapshot: "v2" })),
    createLiveDependencies: vi.fn(() => ({ reads: "live" })),
    createV2Solver: vi.fn(() => ({ id: "deterministic-v2" })),
    createAgenticSolver: vi.fn(() => ({ id: "agentic-v2" })),
    createAdvisor: vi.fn(() => ({ choose: vi.fn() })),
    createOkxClient: vi.fn(),
    readOkxCredentials: vi.fn(),
    runRouteMarketV2: vi.fn(async (_policy, dependencies) => {
      const snapshot = await dependencies.captureSnapshot(_policy);
      await dependencies.saveSnapshot(snapshot);
      await dependencies.saveQuote({ bundle: true }, { routeAuthorized: true }, { quote: true });
      await dependencies.finish("quotes_ready");
      return { quotes: [{ version: 2 }], failures: [] };
    }),
  };
});

vi.mock("../db/client", () => ({
  createDatabase: () => ({ db: { kind: "test-db" } }),
}));
vi.mock("../db/requests", () => ({
  createRequestRepository: () => mocks.repository,
}));
vi.mock("../env", () => ({
  readDatabaseUrl: () => "postgresql://test:test@localhost:5432/cobia",
  readMarketConfig: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/cobia",
    DETERMINISTIC_SOLVER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    XLAYER_RPC_URL: "https://rpc.xlayer.example",
  }),
  readAgenticSolverConfig: () => ({
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_SOLVER_MODEL: "gpt-test",
    AI_SOLVER_PRIVATE_KEY: `0x${"22".repeat(32)}`,
  }),
  readOkxCredentials: mocks.readOkxCredentials,
}));
vi.mock("../okx/client", () => ({ createOkxClient: mocks.createOkxClient }));
vi.mock("../orchestrator/capture-route-snapshot-v2", () => ({
  captureRouteSnapshotV2: mocks.captureRouteSnapshotV2,
}));
vi.mock("../orchestrator/route-snapshot-client", () => ({
  createLiveRouteSnapshotDependencies: mocks.createLiveDependencies,
}));
vi.mock("../orchestrator/run-route-market-v2", () => ({
  runRouteMarketV2: mocks.runRouteMarketV2,
}));
vi.mock("../agentic/openai-route-advisor", () => ({
  createOpenAiRouteAdvisor: mocks.createAdvisor,
}));
vi.mock("@cobia/solvers", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cobia/solvers")>(),
  createDeterministicRouteSolverV2: mocks.createV2Solver,
  createAgenticRouteSolverV2: mocks.createAgenticSolver,
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
  beforeEach(() => vi.clearAllMocks());

  it("runs deterministic and bounded agentic solvers over one pinned snapshot", async () => {
    const result = await openQuoteMarket(policy);

    expect(result).toEqual({ quotes: [{ version: 2 }], failures: [] });
    expect(mocks.repository.createRequest).toHaveBeenCalledWith(policy);
    expect(mocks.createLiveDependencies).toHaveBeenCalledWith("https://rpc.xlayer.example");
    expect(mocks.captureRouteSnapshotV2).toHaveBeenCalledWith(policy, { reads: "live" });
    expect(mocks.createV2Solver).toHaveBeenCalledWith(expect.objectContaining({
      solverId: "deterministic-v2",
      expectedAdapterRegistryHash: registryHash,
    }));
    expect(mocks.createAdvisor).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
      model: "gpt-test",
    });
    expect(mocks.createAgenticSolver).toHaveBeenCalledWith(expect.objectContaining({
      solverId: "agentic-v2",
      advisor: { choose: expect.any(Function) },
      expectedAdapterRegistryHash: registryHash,
    }));
    expect(mocks.runRouteMarketV2).toHaveBeenCalledWith(policy, expect.objectContaining({
      solvers: [{ id: "deterministic-v2" }, { id: "agentic-v2" }],
      expectedAdapterRegistryHash: registryHash,
      quotePriceAtomic: "100000",
    }));
    expect(mocks.repository.saveSnapshot).toHaveBeenCalledWith(policy.requestId, { snapshot: "v2" });
    expect(mocks.repository.saveQuote).toHaveBeenCalledWith(
      policy.requestId,
      { bundle: true },
      { routeAuthorized: true },
      { quote: true },
    );
    expect(mocks.repository.finishMarket).toHaveBeenCalledWith(policy.requestId, "quotes_ready");
    expect(mocks.readOkxCredentials).not.toHaveBeenCalled();
    expect(mocks.createOkxClient).not.toHaveBeenCalled();
  });
});
