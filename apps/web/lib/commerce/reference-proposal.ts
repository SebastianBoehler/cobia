import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commitment,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import {
  CommerceOrderProgramV1Schema,
  CommerceProgramEvidenceV1Schema,
  commerceOrderProgramCommitmentV1,
} from "@cobia/solvers";
import { type Address, type Hash } from "viem";
import { commerceMerchantManifestCommitmentV1, type CommerceMerchantManifestV1 } from "./merchant-manifest";
import { compileX402AuthorizationPlanV1 } from "./x402-plan";
import { reproduceX402PlanV1 } from "./x402-reproduction";

export function buildReferenceCommerceProposalV1(input: {
  offer: unknown;
  manifest: CommerceMerchantManifestV1;
  owner: Address;
  executor: Address;
  nowSec: number;
  block: { number: bigint; hash: Hash };
}) {
  const offer = CommerceOfferV1Schema.parse(input.offer);
  if (offer.eligibility.status !== "executable" || offer.placement.kind !== "x402-exact") {
    throw new Error("Offer is not supported for verified placement");
  }
  if (offer.expiresAt <= input.nowSec + 45) throw new Error("Offer is too close to expiry; refresh it");
  const requestId = crypto.randomUUID();
  const nonce = commitment({ requestId, owner: input.owner, offer: commerceOfferCommitmentV1(offer) }) as Hash;
  const manifestHash = commerceMerchantManifestCommitmentV1(input.manifest);
  const policy = CommerceOrderPolicyV1Schema.parse({
    version: 1, kind: "commerce-order", requestId,
    displayGoal: `Buy ${offer.product.name ?? offer.product.id} from ${offer.merchant.displayName}`,
    owner: input.owner, receiptRecipient: input.owner,
    executionChainId: offer.payment.chainId, nonce, createdAt: input.nowSec,
    deadline: Math.min(offer.expiresAt, input.nowSec + 300),
    competition: { closesAt: input.nowSec + 30, maxRevisionsPerSolver: 5 },
    maxEvidenceAgeSec: 300,
    offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: manifestHash,
    payment: { asset: offer.payment.asset, maxAtomic: offer.payment.atomicAmount },
    evidenceProfile: "payment-settled",
    allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
    limits: { maxActions: 1, maxApprovals: 0, maxActionCalldataBytes: 4, maxExpectedGas: 21_000 },
    forbiddenTargets: [], forbiddenAssets: [],
  });
  const orderCommitment = commitment({ version: 1, requestId, offer: policy.offerCommitment,
    recipient: input.owner, quantity: offer.product.quantity, nonce }) as Hash;
  const program = CommerceOrderProgramV1Schema.parse({
    version: 1, kind: "commerce-order", requestId, chainId: policy.executionChainId,
    policyHash: commerceOrderPolicyCommitmentV1(policy), manifestHash, owner: input.owner,
    executor: input.executor, pinnedBlock: { number: input.block.number.toString(), hash: input.block.hash },
    deadline: policy.deadline, nonce,
    capability: { id: "commerce.order.place", version: 1 },
    parameters: { offerCommitment: policy.offerCommitment, quantity: offer.product.quantity,
      orderCommitment, evidenceProfile: "payment-settled" },
  });
  const plan = compileX402AuthorizationPlanV1({ program, policy, offer, manifest: input.manifest });
  const replay = reproduceX402PlanV1(plan);
  const evidence = CommerceProgramEvidenceV1Schema.parse({
    version: 1, chainId: policy.executionChainId,
    blockNumber: program.pinnedBlock.number, blockHash: program.pinnedBlock.hash,
    capturedAtSec: input.nowSec, programHash: commerceOrderProgramCommitmentV1(program),
    compiledActionHash: replay.compiledActionHash, traceHash: replay.traceHash,
    stateDiffHash: replay.stateDiffHash, receiptCommitment: replay.receiptCommitment,
  });
  return { policy, program, evidence };
}
