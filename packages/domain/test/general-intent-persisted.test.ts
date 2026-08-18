import { describe, expect, it } from "vitest";
import {
  GeneralIntentPolicyV1Schema,
  GeneralIntentSnapshotV1Schema,
  PersistedIntentPolicySchema,
  PersistedIntentSnapshotSchema,
} from "../src";

const address = (byte: string) => `0x${byte.repeat(40)}`;
const hash = (byte: string) => `0x${byte.repeat(64)}`;

describe("persisted general intents", () => {
  it("round-trips the signed policy and pinned snapshot without widening either", () => {
    const policy = GeneralIntentPolicyV1Schema.parse({
      version: 1,
      kind: "general-onchain",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      owner: address("1"),
      executionChainId: 196,
      nonce: hash("1"),
      createdAt: 2_000_000_000,
      deadline: 2_000_001_800,
      maxEvidenceAgeSec: 300,
      manifestHash: hash("2"),
      input: { token: address("2"), maxAtomic: "10000000" },
      allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
      limits: { maxActions: 2, maxApprovals: 2, maxActionCalldataBytes: 1024, maxExpectedGas: 1_000_000 },
      forbiddenTargets: [],
      forbiddenAssets: [],
      balanceConstraints: [{ kind: "minimumIncrease", token: address("3"), atomic: "9950000" }],
      predicates: [],
      objective: { kind: "satisfy" },
    });
    const snapshot = GeneralIntentSnapshotV1Schema.parse({
      version: 1,
      kind: "general-onchain",
      requestId: policy.requestId,
      chainId: 196,
      blockNumber: "123",
      blockHash: hash("3"),
      capturedAt: "2033-05-18T03:33:20.000Z",
      manifestHash: policy.manifestHash,
    });

    expect(PersistedIntentPolicySchema.parse(policy)).toEqual(policy);
    expect(PersistedIntentSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
