import { OpenIntentPolicyV3Schema } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { captureOpenIntentSnapshotV1 } from "./capture-snapshot";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Receive a verified output", owner: "0x1111111111111111111111111111111111111111",
  executionChainIds: [196], nonce: hash("1"), createdAt: 2_000_000_000,
  deadline: 2_000_001_800, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222", maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196,
    token: "0x3333333333333333333333333333333333333333", atomic: "1" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});

describe("open intent snapshot capture", () => {
  it("anchors the competition to one canonical X Layer block", async () => {
    const read = {
      getChainId: vi.fn(async () => 196),
      getBlock: vi.fn(async () => ({ number: 68_461_706n, hash: hash("2"), timestamp: 2_000_000_010n })),
    };

    await expect(captureOpenIntentSnapshotV1(policy, read)).resolves.toEqual({
      version: 1, kind: "open-onchain", requestId: policy.requestId,
      capturedAt: "2033-05-18T03:33:30.000Z",
      anchors: [{ chainId: 196, blockNumber: "68461706", blockHash: hash("2") }],
    });
  });

  it("freezes exact OKX token evidence into the solver snapshot", async () => {
    const output = policy.outcomes[0]!;
    if (!("token" in output)) throw new Error("Fixture outcome must carry a token");
    const outputToken = output.token;
    const getXLayerTokenEvidence = vi.fn(async (token: string) => ({
      chainId: 196 as const, token: token.toLowerCase() as `0x${string}`,
      name: token === policy.inputs[0]!.token ? "Input Token" : "Output Token",
      symbol: token === policy.inputs[0]!.token ? "IN" : "OUT", decimals: 6,
      priceUsd: "1.01", liquidityUsd: "2500000", holderCount: "4200",
      top10HolderPercent: "19.75", marketDataAt: "2033-05-18T03:33:29.000Z",
      communityRecognized: true,
    }));

    const snapshot = await captureOpenIntentSnapshotV1(policy, {
      getChainId: async () => 196,
      getBlock: async () => ({ number: 68_461_706n, hash: hash("2"), timestamp: 2_000_000_010n }),
    }, { getXLayerTokenEvidence });

    expect(getXLayerTokenEvidence).toHaveBeenCalledTimes(2);
    expect(getXLayerTokenEvidence).toHaveBeenNthCalledWith(1, policy.inputs[0]!.token);
    expect(getXLayerTokenEvidence).toHaveBeenNthCalledWith(2, outputToken);
    expect(snapshot.tokenEvidence).toEqual([
      expect.objectContaining({ token: policy.inputs[0]!.token, symbol: "IN", priceUsd: "1.01",
        provider: "okx-market-v6" }),
      expect.objectContaining({ token: outputToken, symbol: "OUT", priceUsd: "1.01",
        provider: "okx-market-v6" }),
    ]);
  });

  it("anchors each declared chain and fails closed on an invalid RPC identity", async () => {
    const multichain = {
      ...policy,
      executionChainIds: [1, 196],
      limits: { ...policy.limits, maxNativeValueAtomicByChain: [
        { chainId: 1, atomic: "0" }, { chainId: 196, atomic: "0" },
      ] },
    } as typeof policy;
    await expect(captureOpenIntentSnapshotV1(multichain, {
      1: { getChainId: async () => 1,
        getBlock: async () => ({ number: 10n, hash: hash("3"), timestamp: 2_000_000_009n }) },
      196: { getChainId: async () => 196,
        getBlock: async () => ({ number: 20n, hash: hash("4"), timestamp: 2_000_000_010n }) },
    })).resolves.toMatchObject({
      capturedAt: "2033-05-18T03:33:29.000Z",
      anchors: [
        { chainId: 1, blockNumber: "10", blockHash: hash("3") },
        { chainId: 196, blockNumber: "20", blockHash: hash("4") },
      ],
    });
    await expect(captureOpenIntentSnapshotV1(policy, {
      getChainId: async () => 1, getBlock: async () => ({ number: 1n, hash: hash("2"), timestamp: 1n }),
    })).rejects.toThrow(/chain/i);
  });
});
