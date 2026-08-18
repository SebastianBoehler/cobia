import { describe, expect, it } from "vitest";
import {
  commitment,
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
  parseGeneralIntentPolicyV2,
} from "../src/index";

const owner = "0x1111111111111111111111111111111111111111";
const inputToken = "0x2222222222222222222222222222222222222222";
const receiptToken = "0x3333333333333333333333333333333333333333";
const readTarget = "0x4444444444444444444444444444444444444444";
const runtimeCodeHash = `0x${"55".repeat(32)}`;
const manifestHash = `0x${"66".repeat(32)}`;
const blockHash = `0x${"77".repeat(32)}`;
const nonce = `0x${"88".repeat(32)}`;

const read = {
  target: readTarget,
  runtimeCodeHash,
  data: `0x70a08231${"0".repeat(24)}${owner.slice(2)}`,
  returnWordIndex: 0,
  decodeType: "uint256" as const,
  gasLimit: 50_000,
  label: "receipt balance",
};

const predicate = {
  ...read,
  phase: "after" as const,
  comparator: "gte" as const,
  bound: "1000000",
};

const policy = {
  version: 2 as const,
  kind: "general-onchain" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440090",
  displayGoal: "Maximize verified receipt balance from 10 USDG",
  owner,
  executionChainId: 196 as const,
  nonce,
  createdAt: 1_999_999_000,
  deadline: 2_000_000_000,
  competition: { closesAt: 1_999_999_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  manifestHash,
  input: { token: inputToken, maxAtomic: "10000000" },
  allowedCapabilities: [{ id: "aave-v3.supply", version: 1 }],
  limits: {
    maxActions: 4,
    maxApprovals: 8,
    maxActionCalldataBytes: 8_192,
    maxExpectedGas: 2_000_000,
  },
  forbiddenTargets: ["0x9999999999999999999999999999999999999999"],
  forbiddenAssets: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  balanceConstraints: [{
    kind: "minimumFinal" as const,
    token: receiptToken,
    atomic: "1000000",
  }],
  predicates: [predicate],
  objective: { kind: "maximize" as const, read },
};

describe("general on-chain intent policy", () => {
  it("accepts a bounded protocol-neutral optimization policy", () => {
    const parsed = GeneralIntentPolicyV2Schema.parse(policy);

    expect(parsed.objective.kind).toBe("maximize");
    expect(parsed.input).toEqual({ token: inputToken, maxAtomic: "10000000" });
    expect(parseGeneralIntentPolicyV2(policy, 1_999_999_500)).toEqual(parsed);
  });

  it("requires a signed display goal and bounded solver competition", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({ ...policy, displayGoal: " " }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({ ...policy, competition: undefined }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      competition: { ...policy.competition, closesAt: policy.createdAt + 901 },
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      competition: { ...policy.competition, closesAt: policy.deadline + 1 },
    }).success).toBe(false);
  });

  it("changes the commitment when any displayed authority changes", () => {
    const variants = [
      { ...policy, displayGoal: "End with at least 10.1 USDt0" },
      { ...policy, owner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      { ...policy, deadline: policy.deadline - 1 },
      { ...policy, competition: { ...policy.competition, closesAt: policy.competition.closesAt + 1 } },
      { ...policy, input: { ...policy.input, maxAtomic: "9999999" } },
      { ...policy, allowedCapabilities: [{ id: "aave-v3.supply", version: 2 }] },
      { ...policy, limits: { ...policy.limits, maxExpectedGas: policy.limits.maxExpectedGas - 1 } },
      { ...policy, forbiddenTargets: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] },
      { ...policy, forbiddenAssets: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] },
      { ...policy, balanceConstraints: [{ ...policy.balanceConstraints[0], atomic: "999999" }] },
      { ...policy, predicates: [{ ...predicate, bound: "999999" }] },
      { ...policy, objective: { kind: "satisfy" as const } },
    ];
    const baseline = commitment(GeneralIntentPolicyV2Schema.parse(policy));
    for (const variant of variants) {
      expect(commitment(GeneralIntentPolicyV2Schema.parse(variant))).not.toBe(baseline);
    }
  });

  it("rejects V1 and unknown authority fields", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({ ...policy, version: 1 }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({ ...policy, recipient: owner }).success).toBe(false);
  });

  it("requires an enforceable post-state outcome", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      balanceConstraints: [],
      predicates: [{ ...predicate, phase: "before" }],
    }).success).toBe(false);
  });

  it("requires sorted unique capabilities and forbidden sets", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      allowedCapabilities: [
        { id: "uniswap-v3.exact-input", version: 1 },
        { id: "aave-v3.supply", version: 1 },
      ],
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      forbiddenAssets: [policy.forbiddenAssets[0], policy.forbiddenAssets[0]],
    }).success).toBe(false);
  });

  it("rejects duplicate predicates and incompatible primitive comparisons", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      predicates: [predicate, predicate],
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      predicates: [{
        ...predicate,
        decodeType: "address",
        comparator: "gte",
        bound: owner,
      }],
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      predicates: [{
        ...predicate,
        decodeType: "bool",
        comparator: "eq",
        bound: "2",
      }],
    }).success).toBe(false);
  });

  it("allows optimization only over signed numeric reads", () => {
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      objective: { kind: "maximize", read: { ...read, decodeType: "address" } },
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      predicates: [],
      forbiddenTargets: [readTarget],
    }).success).toBe(false);
  });

  it("rejects expired, zero-funded, forbidden, or widened policies", () => {
    expect(() => parseGeneralIntentPolicyV2(policy, policy.deadline)).toThrow(/future/i);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      input: { ...policy.input, maxAtomic: "0" },
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      forbiddenAssets: [inputToken],
    }).success).toBe(false);
    expect(GeneralIntentPolicyV2Schema.safeParse({
      ...policy,
      nativeValueAtomic: "1",
    }).success).toBe(false);
  });

  it("canonicalizes signed addresses and hashes to lowercase", () => {
    const checksummedOwner = "0xB6da8E6d497bd3Bc5016416DA57d177085449124";
    const parsed = GeneralIntentPolicyV2Schema.parse({
      ...policy,
      owner: checksummedOwner,
    });

    expect(parsed.owner).toBe(checksummedOwner.toLowerCase());
  });

  it("parses a general pinned-block snapshot without route market fields", () => {
    expect(GeneralIntentSnapshotV1Schema.parse({
      version: 1,
      kind: "general-onchain",
      requestId: policy.requestId,
      chainId: 196,
      blockNumber: "123456",
      blockHash,
      capturedAt: "2026-08-18T10:00:00.000Z",
      manifestHash,
    })).toMatchObject({ blockNumber: "123456", manifestHash });
  });
});
