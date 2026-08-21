import { commitment, type OpenIntentPolicyV3, type OpenIntentSnapshotV1 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import {
  runOpenTransactionProgramSandboxV1,
  type CodingAgentSandboxV1,
} from "../src";

const owner = "0xb6da8e6d497bd3bc5016416da57d177085449124" as const;
const usdt0 = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as const;
const lifi = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae" as const;
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;

const policy: OpenIntentPolicyV3 = {
  version: 3, kind: "open-onchain", requestId: "f0ef2458-bfca-4db8-beb7-160f5e37f337",
  displayGoal: "Bridge USDt0 to Ethereum USDC", owner, executionChainIds: [1, 196],
  nonce: hash("1"), createdAt: 1_786_900_000, deadline: 1_786_901_800,
  competition: { closesAt: 1_786_900_300, maxRevisionsPerSolver: 5 }, maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: usdt0, maximumAtomic: "10000000" }],
  outcomes: [{ kind: "minimum-increase", chainId: 1, token: usdc, atomic: "9800000" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000",
    maxNativeValueAtomicByChain: [{ chainId: 1, atomic: "0" }, { chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
};
const snapshot: OpenIntentSnapshotV1 = {
  version: 1, kind: "open-onchain", requestId: policy.requestId,
  capturedAt: "2026-08-20T10:00:00.000Z",
  anchors: [
    { chainId: 1, blockNumber: "25795612", blockHash: hash("2") },
    { chainId: 196, blockNumber: "68451205", blockHash: hash("3") },
  ],
  tokenEvidence: [{ provider: "okx-market-v6", chainId: 196, token: usdt0,
    name: "Tether USD", symbol: "USDt0", decimals: 6, priceUsd: "1.0001",
    liquidityUsd: "2500000", holderCount: "4200", top10HolderPercent: "19.75",
    marketDataAt: "2026-08-20T09:59:59.000Z", communityRecognized: true }],
};
const program = {
  version: 1, programId: "550e8400-e29b-41d4-a716-446655440091", requestId: policy.requestId,
  policyHash: commitment(policy), owner, createdAt: 1_786_900_100, deadline: policy.deadline,
  maxEvidenceAgeSec: 300,
  stages: [{
    id: "01-bridge", kind: "wallet-transaction", chainId: 196, dependsOn: [], provider: "lifi@1",
    quoteHash: hash("4"), responseHash: hash("5"), fetchedAt: 1_786_900_100,
    expiresAt: 1_786_900_400, sender: owner, recipient: owner,
    input: { token: usdt0, atomic: "10000000" },
    output: { chainId: 1, token: usdc, minimumAtomic: "9800000" },
    approval: { token: usdt0, spender: lifi, maximumAtomic: "10000000" },
    transaction: { target: lifi, selector: "0x4c279d6b", dataHash: hash("6"), valueAtomic: "0" },
    tools: ["layerswap"],
  }],
};
const evidence = {
  version: 1, programHash: commitment(program), capturedAt: 1_786_900_100,
  simulations: [{ stageId: "01-bridge", chainId: 196, blockNumber: "68451205",
    blockHash: hash("3"), transactionDataHash: hash("6"), success: true, calldataBytes: 100, gasUsed: "300000",
    traceHash: hash("7"), stateDiffHash: hash("8"), eventsHash: hash("9"),
    completeAssetCoverage: true, assetDeltas: [], allowanceDeltas: [], codeIdentities: [] }],
};
const providerPayload = { quoteId: "lifi-quote-1", responseHash: hash("5") };
const providerArtifacts = {
  version: 1,
  artifacts: [{
    stageId: "01-bridge", provider: "lifi@1",
    payloadHash: commitment(providerPayload), payload: providerPayload,
  }],
};

function createSandbox(files: Record<string, string>) {
  const writes: Record<string, string> = {};
  const value: CodingAgentSandboxV1 & { writes: typeof writes; stopped: boolean } = {
    writes, stopped: false,
    async writeFile(path, content) { writes[path] = content; },
    async run() { return { exitCode: 0, stdout: "", stderr: "" }; },
    async readFile(path) {
      const content = files[path];
      if (!content) throw new Error(`missing ${path}`);
      return { content, isSymbolicLink: false };
    },
    async stop() { value.stopped = true; },
  };
  return value;
}

function submission(overrides: Record<string, string> = {}) {
  return createSandbox({
    "out/decision.json": JSON.stringify({ version: 1, decision: "submit" }),
    "out/program.json": JSON.stringify(program), "out/evidence.json": JSON.stringify(evidence),
    "out/provider-artifacts.json": JSON.stringify(providerArtifacts),
    "out/run-manifest.json": JSON.stringify({ version: 1, dependencies: [], sources: [], generatedFiles: [] }),
    ...overrides,
  });
}

describe("open transaction-program sandbox", () => {
  it("gives the agent an open tool surface without a protocol allowlist or authority", async () => {
    const sandbox = submission();
    const result = await runOpenTransactionProgramSandboxV1({
      sandbox, generate: async () => ({ responseIds: ["resp_1"], commandCount: 0 }),
      policy, snapshot, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      toolEndpoints: { readRpc: "https://getcobia.com/rpc", lifi: "https://getcobia.com/lifi" },
    });
    const task = sandbox.writes["in/task.json"]!;
    expect(task).not.toMatch(/allowedCapabilities|manifestHash|private.?key|seed|walletProvider/i);
    expect(JSON.parse(task)).toMatchObject({
      kind: "open-onchain", wallet: owner,
      tokenEvidence: snapshot.tokenEvidence,
      tools: { readRpc: { mode: "brokered-read-only" }, lifi: { mode: "brokered-read-only" } },
    });
    expect(result?.program.stages[0]).toMatchObject({ provider: "lifi@1" });
    expect(result?.providerArtifacts).toEqual(providerArtifacts.artifacts);
    expect(JSON.parse(task).outputs).toContain("out/provider-artifacts.json");
    expect(sandbox.stopped).toBe(true);
  });

  it("allows explicit abstention and rejects policy drift", async () => {
    const abstained = createSandbox({
      "out/decision.json": JSON.stringify({ version: 1, decision: "abstain", reasonCode: "NO_ROUTE" }),
    });
    await expect(runOpenTransactionProgramSandboxV1({
      sandbox: abstained, generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy, snapshot, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      toolEndpoints: {},
    })).resolves.toBeNull();

    const drifted = submission({
      "out/program.json": JSON.stringify({ ...program, policyHash: hash("f") }),
    });
    await expect(runOpenTransactionProgramSandboxV1({
      sandbox: drifted, generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy, snapshot, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      toolEndpoints: {},
    })).rejects.toThrow(/policy/i);
  });

  it("rejects mutated provider payloads", async () => {
    const mutated = submission({
      "out/provider-artifacts.json": JSON.stringify({
        ...providerArtifacts,
        artifacts: [{ ...providerArtifacts.artifacts[0], payload: { quoteId: "changed" } }],
      }),
    });
    await expect(runOpenTransactionProgramSandboxV1({
      sandbox: mutated, generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy, snapshot, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      toolEndpoints: {},
    })).rejects.toThrow(/payload hash/i);
  });

  it("rejects missing, extra, or provider-mismatched wallet artifacts", async () => {
    for (const artifacts of [
      [],
      [...providerArtifacts.artifacts, { ...providerArtifacts.artifacts[0], stageId: "02-extra" }],
      [{ ...providerArtifacts.artifacts[0], provider: "evm.raw@1" }],
    ]) {
      const sandbox = submission({
        "out/provider-artifacts.json": JSON.stringify({ version: 1, artifacts }),
      });
      await expect(runOpenTransactionProgramSandboxV1({
        sandbox, generate: async () => ({ responseIds: [], commandCount: 0 }),
        policy, snapshot, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
        toolEndpoints: {},
      })).rejects.toThrow(/provider artifacts/i);
    }
  });
});
