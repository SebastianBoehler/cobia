import { describe, expect, it } from "vitest";
import {
  CommerceOrderPolicyV1Schema,
  commerceOrderPolicyCommitmentV1,
  parseCommerceOrderPolicyV1,
} from "../src/index";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const policy = {
  version: 1 as const,
  kind: "commerce-order" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440099",
  displayGoal: "Buy one committed product for no more than 12.5 USDt0",
  owner: "0x1111111111111111111111111111111111111111",
  receiptRecipient: "0x1111111111111111111111111111111111111111",
  executionChainId: 196 as const,
  nonce: hash("1"),
  createdAt: 2_000_000_000,
  deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 3 },
  maxEvidenceAgeSec: 300,
  offerCommitment: hash("2"),
  merchantManifestHash: hash("3"),
  payment: {
    asset: "0x2222222222222222222222222222222222222222",
    maxAtomic: "12500000",
  },
  evidenceProfile: "onchain-order" as const,
  allowedCapabilities: [{ id: "commerce.order.place" as const, version: 1 as const }],
  limits: {
    maxActions: 1 as const,
    maxApprovals: 1,
    maxActionCalldataBytes: 4_096,
    maxExpectedGas: 1_000_000,
  },
  forbiddenTargets: [],
  forbiddenAssets: [],
};

describe("CommerceOrderPolicyV1", () => {
  it("accepts and commits an exact owner-bound order policy", () => {
    const parsed = CommerceOrderPolicyV1Schema.parse(policy);
    expect(parseCommerceOrderPolicyV1(policy, 2_000_000_100)).toEqual(parsed);
    expect(commerceOrderPolicyCommitmentV1(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes commitment for every authority-bearing field", () => {
    const baseline = commerceOrderPolicyCommitmentV1(CommerceOrderPolicyV1Schema.parse(policy));
    const variants = [
      { ...policy, offerCommitment: hash("4") },
      { ...policy, merchantManifestHash: hash("5") },
      { ...policy, receiptRecipient: "0x3333333333333333333333333333333333333333" },
      { ...policy, payment: { ...policy.payment, maxAtomic: "12499999" } },
      { ...policy, evidenceProfile: "payment-settled" as const },
      { ...policy, deadline: policy.deadline - 1 },
    ];
    for (const variant of variants) {
      expect(commerceOrderPolicyCommitmentV1(CommerceOrderPolicyV1Schema.parse(variant))).not.toBe(baseline);
    }
  });

  it("rejects chain, capability, value, deadline, and forbidden-asset expansion", () => {
    const invalid = [
      { ...policy, executionChainId: 1 },
      { ...policy, allowedCapabilities: [{ id: "arbitrary.call", version: 1 }] },
      { ...policy, payment: { ...policy.payment, maxAtomic: "0" } },
      { ...policy, competition: { ...policy.competition, closesAt: policy.deadline + 1 } },
      { ...policy, forbiddenAssets: [policy.payment.asset] },
      { ...policy, nativeValue: "1" },
    ];
    for (const value of invalid) expect(CommerceOrderPolicyV1Schema.safeParse(value).success).toBe(false);
  });

  it("rejects expired policies and unbound commitments", () => {
    expect(() => parseCommerceOrderPolicyV1(policy, policy.deadline)).toThrow(/future/i);
    expect(CommerceOrderPolicyV1Schema.safeParse({ ...policy, offerCommitment: hash("0") }).success).toBe(false);
    expect(CommerceOrderPolicyV1Schema.safeParse({ ...policy, merchantManifestHash: hash("0") }).success).toBe(false);
  });
});
