import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import { CommerceOrderProgramV1Schema } from "@cobia/solvers";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  CommerceMerchantManifestV1Schema,
  ERC20_TRANSFER_TOPIC0,
  commerceMerchantManifestCommitmentV1,
} from "./merchant-manifest";
import {
  finalizeX402PaymentV2,
  prepareX402AuthorizationV1,
  x402TypedDataV1,
} from "./x402-authorization";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const account = privateKeyToAccount(hash("1"));
const asset = "0x2222222222222222222222222222222222222222";
const payee = "0x3333333333333333333333333333333333333333";
const executor = "0x4444444444444444444444444444444444444444";
const nowSec = 2_000_000_100;
const manifest = CommerceMerchantManifestV1Schema.parse({
  version: 1, chainId: 196,
  entries: [{
    merchantId: "api.example", productCommitment: hash("2"), payee,
    paymentAsset: asset, exactAtomicAmount: "10000",
    placement: {
      kind: "x402-exact", endpoint: "https://api.example/resource",
      facilitator: "https://facilitator.example", assetTransferMethod: "eip3009",
      token: { runtimeCodeHash: hash("3"), eip712Name: "USD Coin", eip712Version: "2" },
    },
    receipt: {
      kind: "eip3009-transfer", topic0: ERC20_TRANSFER_TOPIC0, fromTopicIndex: 1, toTopicIndex: 2,
    },
  }],
  officialSources: ["https://api.example/contracts"],
});
const manifestHash = commerceMerchantManifestCommitmentV1(manifest);
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "x402:api:resource", expiresAt: nowSec + 120,
  source: {
    protocol: "x402-v2", url: "https://bazaar.example/resource", adapterVersion: 1,
    fetchedAt: nowSec - 10, responseHash: hash("6"), provenance: ["resource:https://api.example/resource"],
  },
  merchant: { id: "api.example", displayName: "API", payee, manifestHash },
  product: { id: "resource", commitment: hash("2"), descriptionHash: hash("7"), quantity: "1", mediaHashes: [] },
  payment: { chainId: 196, scheme: "exact", asset, atomicAmount: "10000", maxTimeoutSec: 60 },
  placement: { kind: "x402-exact", endpoint: "https://api.example/resource" },
  evidence: { profile: "payment-settled", receiptRecipient: account.address },
  eligibility: { status: "executable" },
});
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440088",
  displayGoal: "Buy API result", owner: account.address, receiptRecipient: account.address,
  executionChainId: 196, nonce: hash("8"), createdAt: nowSec - 30, deadline: nowSec + 180,
  competition: { closesAt: nowSec + 30, maxRevisionsPerSolver: 2 }, maxEvidenceAgeSec: 120,
  offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: manifestHash,
  payment: { asset, maxAtomic: "10000" }, evidenceProfile: "payment-settled",
  allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 0, maxActionCalldataBytes: 4096, maxExpectedGas: 500_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = CommerceOrderProgramV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: policy.requestId, chainId: 196,
  policyHash: commerceOrderPolicyCommitmentV1(policy), manifestHash, owner: account.address, executor,
  pinnedBlock: { number: "123456", hash: hash("9") }, deadline: policy.deadline, nonce: policy.nonce,
  capability: { id: "commerce.order.place", version: 1 },
  parameters: {
    offerCommitment: policy.offerCommitment, quantity: "1", orderCommitment: hash("a"),
    evidenceProfile: "payment-settled",
  },
});

describe("x402 exact authorization", () => {
  it("builds one exact, deterministic and short-lived EIP-3009 authorization", () => {
    const prepared = prepareX402AuthorizationV1({ program, policy, offer, manifest, nowSec });
    expect(prepared).toMatchObject({
      endpoint: "https://api.example/resource", facilitator: "https://facilitator.example",
      authorization: { from: account.address.toLowerCase(), to: payee, value: "10000", validBefore: `${nowSec + 60}` },
      typedData: { domain: { name: "USD Coin", version: "2", chainId: 196, verifyingContract: asset } },
      accepted: { scheme: "exact", network: "eip155:196", amount: "10000", asset, payTo: payee },
    });
    expect(prepared.authorization.nonce).toBe(prepareX402AuthorizationV1({
      program, policy, offer, manifest, nowSec,
    }).authorization.nonce);
  });

  it("accepts only the policy owner signature and emits canonical PAYMENT-SIGNATURE", async () => {
    const prepared = prepareX402AuthorizationV1({ program, policy, offer, manifest, nowSec });
    const signature = await account.signTypedData(x402TypedDataV1(prepared));
    const finalized = await finalizeX402PaymentV2({ expected: prepared, submitted: prepared, signature });
    const decoded = JSON.parse(Buffer.from(finalized.paymentSignature, "base64").toString("utf8"));
    expect(decoded).toEqual(finalized.paymentPayload);
    expect(decoded.payload.authorization).toEqual(prepared.authorization);
    expect(decoded.payload.signature).toBe(signature);
  });

  it("rejects mutation, the wrong signer, and unsupported merchant semantics", async () => {
    const prepared = prepareX402AuthorizationV1({ program, policy, offer, manifest, nowSec });
    const signature = await account.signTypedData(x402TypedDataV1(prepared));
    const mutations = [
      { ...prepared, authorization: { ...prepared.authorization, to: executor } },
      { ...prepared, authorization: { ...prepared.authorization, value: "9999" } },
      { ...prepared, authorization: { ...prepared.authorization, validBefore: `${nowSec + 61}` } },
      { ...prepared, accepted: { ...prepared.accepted, asset: executor } },
    ];
    for (const submitted of mutations) {
      await expect(finalizeX402PaymentV2({ expected: prepared, submitted, signature })).rejects.toThrow(
        "x402 authorization template mismatch",
      );
    }
    const stranger = privateKeyToAccount(hash("b"));
    await expect(finalizeX402PaymentV2({
      expected: prepared, submitted: prepared,
      signature: await stranger.signTypedData(x402TypedDataV1(prepared)),
    })).rejects.toThrow("x402 signature does not match policy owner");
    expect(() => prepareX402AuthorizationV1({
      program, policy, offer: { ...offer, eligibility: { status: "discovery-only", blockedReason: "MERCHANT_UNREGISTERED" } },
      manifest, nowSec,
    })).toThrow("x402 offer commitment mismatch");
  });
});
