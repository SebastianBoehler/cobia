import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commitment,
  commerceOfferCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { prepareCommercePlacementV1 } from "./placement-service";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = privateKeyToAccount(hash("1"));
const payee = "0x2222222222222222222222222222222222222222";
const asset = "0x3333333333333333333333333333333333333333";
const executor: Address = "0x4444444444444444444444444444444444444444";
const nowSec = 2_000_000_100;
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "x402:api:resource", expiresAt: nowSec + 120,
  source: {
    protocol: "x402-v2", url: "https://bazaar.example/resource", adapterVersion: 1,
    fetchedAt: nowSec - 10, responseHash: hash("2"), provenance: ["resource:https://api.example/resource"],
  },
  merchant: { id: "api.example", displayName: "API", payee, manifestHash: hash("3") },
  product: { id: "resource", commitment: hash("4"), descriptionHash: hash("5"), quantity: "1", mediaHashes: [] },
  payment: { chainId: 196, scheme: "exact", asset, atomicAmount: "10000", maxTimeoutSec: 60 },
  placement: { kind: "x402-exact", endpoint: "https://api.example/resource" },
  evidence: { profile: "payment-settled", receiptRecipient: owner.address },
  eligibility: { status: "executable" },
});
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440077",
  displayGoal: "Buy API result", owner: owner.address, receiptRecipient: owner.address,
  executionChainId: 196, nonce: hash("6"), createdAt: nowSec - 30, deadline: nowSec + 180,
  competition: { closesAt: nowSec + 30, maxRevisionsPerSolver: 2 }, maxEvidenceAgeSec: 120,
  offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: hash("3"),
  payment: { asset, maxAtomic: "10000" }, evidenceProfile: "payment-settled",
  allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 0, maxActionCalldataBytes: 4096, maxExpectedGas: 500_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const plan = X402AuthorizationPlanV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: policy.offerCommitment,
  policyHash: commitment(policy), programHash: hash("7"), owner: owner.address,
  payee, asset, amount: "10000", endpoint: "https://api.example/resource",
  facilitator: "https://facilitator.example", maxTimeoutSec: 60,
  offerExpiresAt: offer.expiresAt, programDeadline: policy.deadline,
  authorizationNonce: hash("8"),
  token: { runtimeCodeHash: hash("9"), eip712Name: "USD Coin", eip712Version: "2" },
  settlement: {
    topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    fromTopicIndex: 1, toTopicIndex: 2,
  },
});

async function signedInput(signature?: `0x${string}`) {
  return {
    policy, ownerSignature: signature ?? await owner.signMessage({ message: { raw: commitment(policy) } }),
    program: {}, evidence: {},
  };
}

function dependencies(accepted = true) {
  return {
    nowSec, executor, manifest: { version: 1, chainId: 196, entries: [], officialSources: [] },
    offers: { get: vi.fn(async () => offer) },
    placements: { prepare: vi.fn(async (input) => ({ ...input, state: "prepared", sequence: 1 })) },
    verify: vi.fn(async () => ({
      accepted, errorCodes: accepted ? [] : ["REPLAY_MISMATCH"], compiled: accepted ? plan : null,
    })),
  };
}

describe("commerce placement preparation", () => {
  it("stores only commitments and returns one exact owner authorization", async () => {
    const deps = dependencies();
    const result = await prepareCommercePlacementV1(await signedInput(), deps);
    expect(deps.offers.get).toHaveBeenCalledWith(policy.offerCommitment);
    expect(deps.placements.prepare).toHaveBeenCalledWith(expect.objectContaining({
      id: policy.requestId, owner: owner.address.toLowerCase(), offerCommitment: policy.offerCommitment,
      policyHash: commitment(policy), programHash: plan.programHash, planHash: commitment(plan),
    }));
    expect(result.authorization).toMatchObject({
      authorization: { from: owner.address.toLowerCase(), to: payee, value: "10000" },
      accepted: { network: "eip155:196", scheme: "exact" },
    });
  });

  it("rejects the wrong owner, missing offer, or failed verifier before persistence", async () => {
    const stranger = privateKeyToAccount(hash("a"));
    const wrong = await stranger.signMessage({ message: { raw: commitment(policy) } });
    const wrongDeps = dependencies();
    await expect(prepareCommercePlacementV1(await signedInput(wrong), wrongDeps)).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(wrongDeps.placements.prepare).not.toHaveBeenCalled();

    const missing = dependencies();
    missing.offers.get.mockResolvedValue(null as never);
    await expect(prepareCommercePlacementV1(await signedInput(), missing)).rejects.toMatchObject({ code: "OFFER_NOT_FOUND" });

    const rejected = dependencies(false);
    await expect(prepareCommercePlacementV1(await signedInput(), rejected)).rejects.toMatchObject({ code: "VERIFICATION_REJECTED" });
    expect(rejected.placements.prepare).not.toHaveBeenCalled();
  });
});
