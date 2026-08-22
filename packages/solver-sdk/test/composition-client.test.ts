import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createSolverExchangeClient } from "../src/client";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const requestId = "550e8400-e29b-41d4-a716-446655440099";
const token = "0x2222222222222222222222222222222222222222";
const policy = CapabilityCompositionPolicyV1Schema.parse({
  version: 1, kind: "capability-composition", requestId,
  displayGoal: "Best registered stablecoin yield", owner: account.address,
  executionChainId: 196, nonce: hash("1"), createdAt: 2_000_000_000,
  deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300, manifestHash: hash("2"),
  input: { token, maxAtomic: "1000000" }, allowedAssets: [token],
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  constraints: [
    { kind: "maximum-conversion-loss", maximumLossBps: 100 },
    { kind: "minimum-registered-receipt-value", minimumValueBps: 9_900,
      receiptCapabilities: ["aave-v3.supply@1"] },
  ],
  objective: { kind: "maximize-net-yield", horizonDays: 30,
    receiptCapabilities: ["aave-v3.supply@1"] },
  limits: { maxActions: 8, maxApprovals: 8, maxActionCalldataBytes: 16_384,
    maxExpectedGas: 5_000_000, maxSolverFeeAtomic: "0" },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = CapabilityCompositionSnapshotV1Schema.parse({
  version: 1, kind: "capability-composition", requestId,
  capturedAt: "2033-05-18T03:33:30.000Z", manifestHash: policy.manifestHash,
  route: { version: 2, requestId, chainId: 196, blockNumber: "68461706",
    blockHash: hash("3"), capturedAt: "2033-05-18T03:33:30.000Z",
    adapterRegistryHash: hash("4"), scannedAdapters: ["aave-v3@1"],
    valuations: [], opportunities: [] },
  gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" },
});

async function exchange(snapshotValue: unknown = snapshot) {
  const policyHash = commitment(policy);
  const ownerSignature = await account.signMessage({ message: { raw: policyHash } });
  return Response.json({ observedAt: 2_000_000_100, intents: [{
    id: requestId, policy, policyHash, ownerSignature,
    snapshot: snapshotValue, snapshotHash: commitment(snapshotValue),
    competitionClosesAt: policy.competition.closesAt,
    links: { intent: `/api/intents/${requestId}`, decisions: `/api/intents/${requestId}/decisions` },
  }] });
}

describe("composition solver exchange", () => {
  it("accepts an owner-signed policy with its exact composition snapshot", async () => {
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => exchange()) });

    await expect(client.listIntents()).resolves.toMatchObject({
      intents: [{ policy: { kind: "capability-composition" },
        snapshot: { kind: "capability-composition" } }],
    });
  });

  it("rejects a policy and snapshot from different intent kinds", async () => {
    const openSnapshot = { version: 1, kind: "open-onchain", requestId,
      capturedAt: snapshot.capturedAt,
      anchors: [{ chainId: 196, blockNumber: "68461706", blockHash: hash("3") }] };
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => exchange(openSnapshot)) });

    await expect(client.listIntents()).rejects.toThrow(/kinds must match/i);
  });
});
