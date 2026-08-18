import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commitment,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import { CommerceOrderProgramV1Schema, commerceOrderProgramCommitmentV1 } from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { compileCommerceOrderActionV1 } from "../capabilities/commerce-order";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
} from "./merchant-manifest";
import { CommerceProgramEvidenceV1Schema, verifyCommerceProgramV1 } from "./program-verifier";
import { compileX402AuthorizationPlanV1 } from "./x402-plan";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const target = "0x3333333333333333333333333333333333333333";
const payee = "0x4444444444444444444444444444444444444444";
const executor = "0x5555555555555555555555555555555555555555";
const nowSec = 2_000_000_100;
const manifest = CommerceMerchantManifestV1Schema.parse({
  version: 1, chainId: 196,
  entries: [{
    merchantId: "merchant.example", productCommitment: hash("1"), payee,
    paymentAsset: asset, exactAtomicAmount: "12500000",
    placement: {
      kind: "direct-contract", target, runtimeCodeHash: hash("2"),
      functionSignature: "placeOrder(bytes32,address,uint256,address,uint256,address)",
      selector: "0x848d6709",
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
const manifestHash = commerceMerchantManifestCommitmentV1(manifest);
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "merchant:coffee", expiresAt: nowSec + 300,
  source: {
    protocol: "x402-v2", url: "https://merchant.example/order", adapterVersion: 1,
    fetchedAt: nowSec - 30, responseHash: hash("4"), provenance: ["direct-contract"],
  },
  merchant: { id: "merchant.example", displayName: "Merchant", payee, manifestHash },
  product: {
    id: "coffee", commitment: hash("1"), descriptionHash: hash("5"), quantity: "1", mediaHashes: [],
  },
  payment: { chainId: 196, scheme: "exact", asset, atomicAmount: "12500000", maxTimeoutSec: 60 },
  placement: { kind: "direct-contract", capabilityId: "commerce.order.place", capabilityVersion: 1 },
  evidence: { profile: "onchain-order", receiptRecipient: owner },
  eligibility: { status: "executable" },
});
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440099",
  displayGoal: "Buy one coffee", owner, receiptRecipient: owner, executionChainId: 196,
  nonce: hash("6"), createdAt: nowSec - 60, deadline: nowSec + 600,
  competition: { closesAt: nowSec + 300, maxRevisionsPerSolver: 3 }, maxEvidenceAgeSec: 300,
  offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: manifestHash,
  payment: { asset, maxAtomic: "12500000" }, evidenceProfile: "onchain-order",
  allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 1, maxActionCalldataBytes: 4096, maxExpectedGas: 1_000_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = CommerceOrderProgramV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: policy.requestId, chainId: 196,
  policyHash: commerceOrderPolicyCommitmentV1(policy), manifestHash, owner, executor,
  pinnedBlock: { number: "123456", hash: hash("7") }, deadline: policy.deadline, nonce: policy.nonce,
  capability: { id: "commerce.order.place", version: 1 },
  parameters: {
    offerCommitment: policy.offerCommitment, quantity: "1", orderCommitment: hash("8"),
    evidenceProfile: "onchain-order",
  },
});
const compiled = compileCommerceOrderActionV1({ program, policy, offer, manifest });
const evidence = CommerceProgramEvidenceV1Schema.parse({
  version: 1, chainId: 196, blockNumber: program.pinnedBlock.number,
  blockHash: program.pinnedBlock.hash, capturedAtSec: nowSec - 10,
  programHash: commerceOrderProgramCommitmentV1(program), compiledActionHash: commitment(compiled),
  traceHash: hash("9"), stateDiffHash: hash("a"), receiptCommitment: hash("b"),
});

function verify(overrides: Record<string, unknown> = {}) {
  return verifyCommerceProgramV1({
    policy, offer, manifest, program, evidence, wallet: owner, executor, nowSec,
    confirmAnchor: async () => true,
    readCodeHash: async () => hash("2"),
    replay: async () => ({
      reproduced: true, compiledActionHash: evidence.compiledActionHash,
      traceHash: evidence.traceHash, stateDiffHash: evidence.stateDiffHash,
      receiptCommitment: evidence.receiptCommitment,
    }),
    ...overrides,
  });
}

describe("commerce program verifier", () => {
  it("independently recompiles and accepts matching fresh evidence", async () => {
    await expect(verify()).resolves.toMatchObject({ accepted: true, errorCodes: [], compiled });
  });

  it("rejects chain, offer, policy, owner, recipient, price, and evidence expansion", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ program: { ...program, chainId: 1 } }, "CHAIN_UNSUPPORTED"],
      [{ program: { ...program, parameters: { ...program.parameters, offerCommitment: hash("c") } } }, "OFFER_CHANGED"],
      [{ wallet: payee }, "POLICY_MISMATCH"],
      [{ offer: { ...offer, evidence: { ...offer.evidence, receiptRecipient: payee } } }, "RECEIPT_RECIPIENT_MISMATCH"],
      [{ offer: { ...offer, payment: { ...offer.payment, atomicAmount: "12500001" } } }, "PRICE_BOUND_EXCEEDED"],
      [{ program: { ...program, parameters: { ...program.parameters, orderCommitment: hash("0") } } }, "PROGRAM_SCHEMA_INVALID"],
    ];
    for (const [change, code] of cases) {
      const result = await verify(change);
      expect(result.accepted, code).toBe(false);
      expect(result.errorCodes, code).toContain(code);
    }
  });

  it("rejects expired offers, stale evidence, reorgs, code drift, and spoofed replay", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ nowSec: offer.expiresAt }, "OFFER_EXPIRED"],
      [{ nowSec: evidence.capturedAtSec + policy.maxEvidenceAgeSec + 1 }, "STALE_EVIDENCE"],
      [{ confirmAnchor: async () => false }, "ANCHOR_MISMATCH"],
      [{ readCodeHash: async () => hash("c") }, "TARGET_CODE_MISMATCH"],
      [{ replay: async () => ({ reproduced: false }) }, "REPLAY_MISMATCH"],
      [{ evidence: { ...evidence, traceHash: hash("c") } }, "REPLAY_MISMATCH"],
    ];
    for (const [change, code] of cases) {
      const result = await verify(change);
      expect(result.accepted, code).toBe(false);
      expect(result.errorCodes, code).toContain(code);
    }
  });

  it("returns specific rejection codes rather than trusting agent rationale", async () => {
    const result = await verify({
      program: { ...program, rationale: "I verified this is safe" },
    });
    expect(result).toMatchObject({ accepted: false, errorCodes: ["PROGRAM_SCHEMA_INVALID"] });
  });

  it("verifies x402 plans without treating remote payloads as calldata", async () => {
    const xManifest = CommerceMerchantManifestV1Schema.parse({
      ...manifest,
      entries: [{
        ...manifest.entries[0]!,
        placement: {
          kind: "x402-exact", endpoint: "https://merchant.example/order",
          facilitator: "https://facilitator.example", assetTransferMethod: "eip3009",
          token: { runtimeCodeHash: hash("2"), eip712Name: "USD Coin", eip712Version: "2" },
        },
        receipt: { kind: "eip3009-transfer", topic0: hash("3"), fromTopicIndex: 1, toTopicIndex: 2 },
      }],
    });
    const xManifestHash = commerceMerchantManifestCommitmentV1(xManifest);
    const xOffer = CommerceOfferV1Schema.parse({
      ...offer,
      merchant: { ...offer.merchant, manifestHash: xManifestHash },
      placement: { kind: "x402-exact", endpoint: "https://merchant.example/order" },
      evidence: { profile: "payment-settled", receiptRecipient: owner },
    });
    const xPolicy = CommerceOrderPolicyV1Schema.parse({
      ...policy,
      offerCommitment: commerceOfferCommitmentV1(xOffer), merchantManifestHash: xManifestHash,
      evidenceProfile: "payment-settled",
    });
    const xProgram = CommerceOrderProgramV1Schema.parse({
      ...program, policyHash: commerceOrderPolicyCommitmentV1(xPolicy), manifestHash: xManifestHash,
      parameters: {
        ...program.parameters, offerCommitment: xPolicy.offerCommitment, evidenceProfile: "payment-settled",
      },
    });
    const plan = compileX402AuthorizationPlanV1({
      program: xProgram, policy: xPolicy, offer: xOffer, manifest: xManifest,
    });
    const xEvidence = CommerceProgramEvidenceV1Schema.parse({
      ...evidence, programHash: commerceOrderProgramCommitmentV1(xProgram),
      compiledActionHash: commitment(plan),
    });
    const result = await verifyCommerceProgramV1({
      policy: xPolicy, offer: xOffer, manifest: xManifest, program: xProgram, evidence: xEvidence,
      wallet: owner, executor, nowSec,
      confirmAnchor: async () => true,
      readCodeHash: async () => hash("2"),
      replay: async () => ({
        reproduced: true, compiledActionHash: xEvidence.compiledActionHash,
        traceHash: xEvidence.traceHash, stateDiffHash: xEvidence.stateDiffHash,
        receiptCommitment: xEvidence.receiptCommitment,
      }),
    });
    expect(result).toMatchObject({ accepted: true, errorCodes: [], compiled: plan });
    expect("data" in result.compiled!).toBe(false);
  });
});
