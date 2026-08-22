import { describe, expect, it } from "vitest";
import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  parseOpenIntentPolicyV3,
} from "../src/open-intent-policy";

const OWNER = "0xb6da8e6d497bd3bc5016416da57d177085449124";
const TOKEN = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const OUTPUT = "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0";
const HASH = `0x${"11".repeat(32)}`;

const policy = {
  version: 3,
  kind: "open-onchain",
  requestId: "f0ef2458-bfca-4db8-beb7-160f5e37f337",
  displayGoal: "Bridge USDt0 and acquire an eligible tokenized equity",
  owner: OWNER,
  executionChainIds: [1, 196],
  nonce: HASH,
  createdAt: 1_786_900_000,
  deadline: 1_786_901_800,
  competition: { closesAt: 1_786_900_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: TOKEN, maximumAtomic: "10000000" }],
  outcomes: [{
    kind: "minimum-increase",
    chainId: 1,
    token: OUTPUT,
    atomic: "1",
  }],
  limits: {
    maxStages: 8,
    maxTransactions: 6,
    maxApprovals: 4,
    maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000",
    maxNativeValueAtomicByChain: [{ chainId: 1, atomic: "0" }, { chainId: 196, atomic: "0" }],
  },
  forbiddenTargets: [],
  forbiddenAssets: [],
};

describe("open intent policy v3", () => {
  it("accepts enforceable cross-chain outcomes without a capability allowlist", () => {
    const parsed = OpenIntentPolicyV3Schema.parse(policy);
    expect(parsed.executionChainIds).toEqual([1, 196]);
    expect(parsed).not.toHaveProperty("allowedCapabilities");
    expect(parsed).not.toHaveProperty("manifestHash");
  });

  it("rejects attempts to smuggle solver or capability restrictions", () => {
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      allowedCapabilities: [{ id: "uniswap-v3.exact-input", version: 1 }],
    })).toThrow();
    expect(() => OpenIntentPolicyV3Schema.parse({ ...policy, preferredSolver: "cobia" })).toThrow();
  });

  it("requires outcomes and inputs to use declared, non-forbidden chains and assets", () => {
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      executionChainIds: [196],
    })).toThrow();
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      forbiddenAssets: [TOKEN],
    })).toThrow();
    expect(() => OpenIntentPolicyV3Schema.parse({ ...policy, outcomes: [] })).toThrow();
  });

  it("requires sorted unique canonical sets and explicit native-value bounds", () => {
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      executionChainIds: [196, 1],
    })).toThrow();
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      limits: { ...policy.limits, maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
    })).toThrow();
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy,
      executionChainIds: [1],
      inputs: [{ ...policy.inputs[0], chainId: 1 }],
      limits: { ...policy.limits, maxNativeValueAtomicByChain: [{ chainId: 1, atomic: "0" }] },
    })).toThrow(/X Layer/i);
  });

  it("rejects expired policies at the trust boundary", () => {
    expect(() => parseOpenIntentPolicyV3(policy, policy.deadline)).toThrow(/future/);
  });

  it("accepts a bounded minimum stage count and rejects it above the maximum", () => {
    expect(OpenIntentPolicyV3Schema.parse({
      ...policy, limits: { ...policy.limits, minimumStages: 2 },
    }).limits.minimumStages).toBe(2);
    expect(() => OpenIntentPolicyV3Schema.parse({
      ...policy, limits: { ...policy.limits, minimumStages: 9, maxStages: 8 },
    })).toThrow(/minimum.*stage/i);
  });

  it("anchors every declared chain without a protocol manifest", () => {
    const snapshot = OpenIntentSnapshotV1Schema.parse({
      version: 1,
      kind: "open-onchain",
      requestId: policy.requestId,
      capturedAt: "2026-08-20T10:00:00.000Z",
      anchors: [
        { chainId: 1, blockNumber: "25795612", blockHash: HASH },
        { chainId: 196, blockNumber: "68451205", blockHash: `0x${"22".repeat(32)}` },
      ],
    });
    expect(snapshot).not.toHaveProperty("manifestHash");
    expect(snapshot.anchors.map(({ chainId }) => chainId)).toEqual([1, 196]);
  });
});
