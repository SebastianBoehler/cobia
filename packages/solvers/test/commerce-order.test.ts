import { CommerceOrderPolicyV1Schema, commerceOrderPolicyCommitmentV1 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { CommerceOrderProgramV1Schema, commerceOrderProgramCommitmentV1 } from "../src/index";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const owner = "0x1111111111111111111111111111111111111111";
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440099",
  displayGoal: "Buy one committed product", owner, receiptRecipient: owner,
  executionChainId: 196, nonce: hash("1"), createdAt: 2_000_000_000,
  deadline: 2_000_000_600, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 3 },
  maxEvidenceAgeSec: 300, offerCommitment: hash("2"), merchantManifestHash: hash("3"),
  payment: { asset: "0x2222222222222222222222222222222222222222", maxAtomic: "12500000" },
  evidenceProfile: "onchain-order", allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 1, maxActionCalldataBytes: 4096, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = {
  version: 1 as const,
  kind: "commerce-order" as const,
  requestId: policy.requestId,
  chainId: 196 as const,
  policyHash: commerceOrderPolicyCommitmentV1(policy),
  manifestHash: policy.merchantManifestHash,
  owner,
  executor: "0x3333333333333333333333333333333333333333",
  pinnedBlock: { number: "123456", hash: hash("4") },
  deadline: policy.deadline,
  nonce: policy.nonce,
  capability: { id: "commerce.order.place" as const, version: 1 as const },
  parameters: {
    offerCommitment: policy.offerCommitment,
    quantity: "1",
    orderCommitment: hash("5"),
    evidenceProfile: policy.evidenceProfile,
  },
};

describe("CommerceOrderProgramV1", () => {
  it("contains only typed solver choices and a canonical commitment", () => {
    const parsed = CommerceOrderProgramV1Schema.parse(program);
    expect(Object.keys(parsed.parameters).sort()).toEqual([
      "evidenceProfile", "offerCommitment", "orderCommitment", "quantity",
    ]);
    expect(commerceOrderProgramCommitmentV1(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects any solver-authored transaction or payment field", () => {
    for (const injected of [
      { target: owner }, { selector: "0x12345678" }, { calldata: "0x1234" },
      { payee: owner }, { asset: policy.payment.asset }, { amount: "1" },
      { endpoint: "https://merchant.example" },
    ]) {
      expect(CommerceOrderProgramV1Schema.safeParse({
        ...program, parameters: { ...program.parameters, ...injected },
      }).success).toBe(false);
    }
  });

  it("rejects changed offer, capability, evidence, chain, quantity, and zero commitments", () => {
    const invalid = [
      { ...program, chainId: 1 },
      { ...program, capability: { id: "arbitrary.call", version: 1 } },
      { ...program, parameters: { ...program.parameters, offerCommitment: hash("6") } },
      { ...program, parameters: { ...program.parameters, evidenceProfile: "payment-settled" } },
      { ...program, parameters: { ...program.parameters, quantity: "0" } },
      { ...program, parameters: { ...program.parameters, orderCommitment: hash("0") } },
    ];
    expect(CommerceOrderProgramV1Schema.safeParse(invalid[0]).success).toBe(false);
    for (const value of invalid.slice(1, 2)) expect(CommerceOrderProgramV1Schema.safeParse(value).success).toBe(false);
    for (const value of invalid.slice(2)) {
      const parsed = CommerceOrderProgramV1Schema.safeParse(value);
      if (parsed.success) {
        expect(parsed.data.parameters).not.toEqual(program.parameters);
      }
    }
  });
});
