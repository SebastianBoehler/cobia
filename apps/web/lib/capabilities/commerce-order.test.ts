import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import { CommerceOrderProgramV1Schema } from "@cobia/solvers";
import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { compileCommerceOrderActionV1 } from "./commerce-order";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
} from "../commerce/merchant-manifest";

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const owner = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const target = "0x3333333333333333333333333333333333333333";
const payee = "0x4444444444444444444444444444444444444444";
const productCommitment = hash("1");
const signature = "placeOrder(bytes32,address,uint256,address,uint256,address)";
const manifest = CommerceMerchantManifestV1Schema.parse({
  version: 1, chainId: 196,
  entries: [{
    merchantId: "merchant.example", productCommitment, payee, paymentAsset: asset,
    exactAtomicAmount: "12500000",
    placement: {
      kind: "direct-contract", target, runtimeCodeHash: hash("2"),
      functionSignature: signature, selector: "0x848d6709",
      argumentBindings: [
        "orderCommitment", "receiptRecipient", "quantity", "paymentAsset", "paymentAmount", "paymentPayee",
      ], expectedGas: 500_000,
    },
    receipt: {
      kind: "event", emitter: target, runtimeCodeHash: hash("2"), topic0: hash("3"),
      ownerTopicIndex: 1, orderCommitmentTopicIndex: 2,
    },
  }],
  officialSources: ["https://merchant.example/contracts/order"],
});
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "merchant:coffee", expiresAt: 2_000_000_500,
  source: {
    protocol: "x402-v2", url: "https://merchant.example/order", adapterVersion: 1,
    fetchedAt: 2_000_000_000, responseHash: hash("4"), provenance: ["direct-contract"],
  },
  merchant: {
    id: "merchant.example", displayName: "Merchant", payee,
    manifestHash: commerceMerchantManifestCommitmentV1(manifest),
  },
  product: {
    id: "coffee", commitment: productCommitment, descriptionHash: hash("5"),
    quantity: "1", mediaHashes: [],
  },
  payment: { chainId: 196, scheme: "exact", asset, atomicAmount: "12500000", maxTimeoutSec: 60 },
  placement: { kind: "direct-contract", capabilityId: "commerce.order.place", capabilityVersion: 1 },
  evidence: { profile: "onchain-order", receiptRecipient: owner },
  eligibility: { status: "executable" },
});
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440099",
  displayGoal: "Buy one coffee", owner, receiptRecipient: owner, executionChainId: 196,
  nonce: hash("6"), createdAt: 2_000_000_000, deadline: 2_000_000_600,
  competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 3 }, maxEvidenceAgeSec: 300,
  offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: commerceMerchantManifestCommitmentV1(manifest),
  payment: { asset, maxAtomic: "12500000" }, evidenceProfile: "onchain-order",
  allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 1, maxActionCalldataBytes: 4096, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = CommerceOrderProgramV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: policy.requestId, chainId: 196,
  policyHash: commerceOrderPolicyCommitmentV1(policy), manifestHash: policy.merchantManifestHash,
  owner, executor: "0x5555555555555555555555555555555555555555",
  pinnedBlock: { number: "123456", hash: hash("7") }, deadline: policy.deadline, nonce: policy.nonce,
  capability: { id: "commerce.order.place", version: 1 },
  parameters: {
    offerCommitment: policy.offerCommitment, quantity: "1", orderCommitment: hash("8"),
    evidenceProfile: "onchain-order",
  },
});

describe("commerce order capability", () => {
  it("compiles trusted manifest semantics and owner-bound arguments", () => {
    const compiled = compileCommerceOrderActionV1({ program, policy, offer, manifest });
    const decoded = decodeFunctionData({ abi: parseAbi([`function ${signature}`]), data: compiled.data });

    expect(compiled).toMatchObject({ target, selector: "0x848d6709", expectedGas: 500_000 });
    expect(decoded.args).toEqual([program.parameters.orderCommitment, owner, 1n, asset, 12_500_000n, payee]);
    expect(compiled.spend).toEqual([{ token: asset, atomic: "12500000" }]);
    expect(compiled.evidencePredicates).toEqual([manifest.entries[0]?.receipt]);
  });

  it("rejects changed offer, manifest, payee, amount, recipient, and selector", () => {
    const invalid = [
      { offer: { ...offer, product: { ...offer.product, commitment: hash("9") } } },
      { offer: { ...offer, payment: { ...offer.payment, atomicAmount: "12500001" } } },
      { offer: { ...offer, evidence: { ...offer.evidence, receiptRecipient: payee } } },
      { manifest: { ...manifest, entries: [{ ...manifest.entries[0]!, payee: owner }] } },
      { manifest: { ...manifest, entries: [{ ...manifest.entries[0]!, placement: { ...manifest.entries[0]!.placement, selector: "0x00000000" } }] } },
    ];
    for (const change of invalid) {
      expect(() => compileCommerceOrderActionV1({
        program,
        policy,
        offer: CommerceOfferV1Schema.parse(change.offer ?? offer),
        manifest: CommerceMerchantManifestV1Schema.parse(change.manifest ?? manifest),
      })).toThrow();
    }
  });
});
