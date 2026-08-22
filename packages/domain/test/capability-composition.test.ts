import { describe, expect, it } from "vitest";
import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
  parseCapabilityCompositionPolicyV1,
} from "../src/index";

const owner = "0x1111111111111111111111111111111111111111";
const usdg = "0x2222222222222222222222222222222222222222";
const usdt0 = "0x3333333333333333333333333333333333333333";
const manifestHash = `0x${"44".repeat(32)}`;
const blockHash = `0x${"55".repeat(32)}`;
const nonce = `0x${"66".repeat(32)}`;
const requestId = "550e8400-e29b-41d4-a716-446655440099";

const policy = {
  version: 1 as const,
  kind: "capability-composition" as const,
  requestId,
  displayGoal: "Enter the best verified stablecoin-yield route",
  owner,
  executionChainId: 196 as const,
  nonce,
  createdAt: 2_000_000_000,
  deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  manifestHash,
  input: { token: usdg, maxAtomic: "1000000" },
  allowedAssets: [usdg, usdt0],
  allowedCapabilities: [
    { id: "aave-v3.supply", version: 1 },
    { id: "curve-stableswap-ng.exact-input", version: 1 },
    { id: "uniswap-v3.exact-input", version: 1 },
  ],
  constraints: [
    { kind: "maximum-conversion-loss", maximumLossBps: 100 },
    { kind: "minimum-registered-receipt-value", minimumValueBps: 9_900,
      receiptCapabilities: ["aave-v3.supply@1"] },
  ],
  objective: { kind: "maximize-net-yield", horizonDays: 30,
    receiptCapabilities: ["aave-v3.supply@1"] },
  limits: {
    maxActions: 8,
    maxApprovals: 8,
    maxActionCalldataBytes: 16_384,
    maxExpectedGas: 5_000_000,
    maxSolverFeeAtomic: "0",
  },
  forbiddenTargets: [],
  forbiddenAssets: [],
};

const route = {
  version: 2 as const,
  requestId,
  chainId: 196 as const,
  blockNumber: "70000000",
  blockHash,
  capturedAt: "2026-08-22T14:00:00.000Z",
  adapterRegistryHash: manifestHash,
  scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1", "uniswap-v3@1"],
  valuations: [
    { asset: usdg, decimals: 6, priceUsdE8: "100000000" },
    { asset: usdt0, decimals: 6, priceUsdE8: "99990000" },
  ],
  opportunities: [],
};

describe("registered capability composition", () => {
  it("accepts the bounded cross-route yield authority", () => {
    const parsed = CapabilityCompositionPolicyV1Schema.parse(policy);

    expect(parsed.objective).toEqual({
      kind: "maximize-net-yield",
      horizonDays: 30,
      receiptCapabilities: ["aave-v3.supply@1"],
    });
    expect(parseCapabilityCompositionPolicyV1(policy, policy.createdAt + 1)).toEqual(parsed);
  });

  it("binds timing and every economic authority into the commitment", () => {
    const baseline = commitment(CapabilityCompositionPolicyV1Schema.parse(policy));
    const variants = [
      { ...policy, deadline: policy.deadline - 1 },
      { ...policy, input: { ...policy.input, maxAtomic: "999999" } },
      { ...policy, constraints: [{ kind: "maximum-conversion-loss", maximumLossBps: 99 }, policy.constraints[1]] },
      { ...policy, objective: { ...policy.objective, horizonDays: 31 } },
    ];
    for (const variant of variants) {
      expect(commitment(CapabilityCompositionPolicyV1Schema.parse(variant))).not.toBe(baseline);
    }
  });

  it("rejects unsorted, widened, contradictory, and expired authority", () => {
    expect(CapabilityCompositionPolicyV1Schema.safeParse({
      ...policy,
      allowedCapabilities: [...policy.allowedCapabilities].reverse(),
    }).success).toBe(false);
    expect(CapabilityCompositionPolicyV1Schema.safeParse({
      ...policy,
      allowedAssets: [usdt0, usdg],
    }).success).toBe(false);
    expect(CapabilityCompositionPolicyV1Schema.safeParse({
      ...policy,
      forbiddenAssets: [usdg],
    }).success).toBe(false);
    expect(CapabilityCompositionPolicyV1Schema.safeParse({
      ...policy,
      constraints: [{ kind: "maximum-conversion-loss", maximumLossBps: 100 }],
    }).success).toBe(false);
    expect(() => parseCapabilityCompositionPolicyV1(policy, policy.deadline)).toThrow(/future/i);
  });

  it("accepts a route, gas, and native-price snapshot with matching identity", () => {
    expect(CapabilityCompositionSnapshotV1Schema.parse({
      version: 1,
      kind: "capability-composition",
      requestId,
      capturedAt: route.capturedAt,
      manifestHash,
      route,
      gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" },
    })).toMatchObject({ requestId, route: { blockNumber: "70000000" } });
  });

  it("rejects a snapshot that mixes requests or capture times", () => {
    const base = { version: 1, kind: "capability-composition", requestId,
      capturedAt: route.capturedAt, manifestHash, route,
      gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" } };
    expect(CapabilityCompositionSnapshotV1Schema.safeParse({
      ...base, route: { ...route, requestId: "550e8400-e29b-41d4-a716-446655440098" },
    }).success).toBe(false);
    expect(CapabilityCompositionSnapshotV1Schema.safeParse({
      ...base, capturedAt: "2026-08-22T14:00:01.000Z",
    }).success).toBe(false);
  });
});
