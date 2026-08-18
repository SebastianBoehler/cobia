import {
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
  type CommerceOfferV1,
  type CommerceOrderPolicyV1,
} from "@cobia/domain";
import type { CompiledCapabilityActionV1 } from "@cobia/solvers";
import { CommerceOrderProgramV1Schema, type CommerceOrderProgramV1 } from "@cobia/solvers";
import { concatHex, encodeAbiParameters, isAddressEqual, parseAbiItem, size } from "viem";
import {
  CommerceMerchantManifestV1Schema,
  commerceMerchantManifestCommitmentV1,
  type CommerceMerchantManifestV1,
} from "../commerce/merchant-manifest";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function boundArgument(
  binding: CommerceMerchantManifestV1["entries"][number]["placement"] extends infer _T ? string : never,
  input: { program: CommerceOrderProgramV1; policy: CommerceOrderPolicyV1; offer: CommerceOfferV1 },
): unknown {
  const values: Record<string, unknown> = {
    orderCommitment: input.program.parameters.orderCommitment,
    receiptRecipient: input.policy.receiptRecipient,
    quantity: BigInt(input.program.parameters.quantity),
    paymentAsset: input.offer.payment.asset,
    paymentAmount: BigInt(input.offer.payment.atomicAmount),
    paymentPayee: input.offer.merchant.payee,
    payer: input.policy.owner,
  };
  invariant(binding in values, "Commerce argument binding is unsupported");
  return values[binding];
}

export function compileCommerceOrderActionV1(raw: {
  program: CommerceOrderProgramV1;
  policy: CommerceOrderPolicyV1;
  offer: CommerceOfferV1;
  manifest: CommerceMerchantManifestV1;
}): CompiledCapabilityActionV1 {
  const program = CommerceOrderProgramV1Schema.parse(raw.program);
  const manifest = CommerceMerchantManifestV1Schema.parse(raw.manifest);
  const { policy, offer } = raw;
  const manifestHash = commerceMerchantManifestCommitmentV1(manifest);
  invariant(program.policyHash === commerceOrderPolicyCommitmentV1(policy), "Commerce policy commitment mismatch");
  invariant(program.manifestHash === manifestHash && policy.merchantManifestHash === manifestHash,
    "Commerce merchant manifest mismatch");
  invariant(program.parameters.offerCommitment === commerceOfferCommitmentV1(offer) &&
    policy.offerCommitment === program.parameters.offerCommitment, "Commerce offer commitment mismatch");
  invariant(program.requestId === policy.requestId && program.nonce === policy.nonce &&
    program.deadline <= policy.deadline && isAddressEqual(program.owner, policy.owner), "Commerce program policy mismatch");
  invariant(offer.eligibility.status === "executable" && offer.placement.kind === "direct-contract",
    "Commerce offer is not direct-contract executable");
  invariant(program.parameters.quantity === offer.product.quantity, "Commerce quantity mismatch");
  invariant(program.parameters.evidenceProfile === policy.evidenceProfile &&
    offer.evidence.profile === policy.evidenceProfile, "Commerce evidence profile mismatch");
  invariant(isAddressEqual(offer.evidence.receiptRecipient, policy.receiptRecipient),
    "Commerce receipt recipient mismatch");
  invariant(isAddressEqual(offer.payment.asset, policy.payment.asset) &&
    BigInt(offer.payment.atomicAmount) <= BigInt(policy.payment.maxAtomic), "Commerce payment bound mismatch");

  const entry = manifest.entries.find((candidate) => candidate.merchantId === offer.merchant.id &&
    candidate.productCommitment === offer.product.commitment);
  invariant(entry, "Commerce merchant product is unregistered");
  invariant(entry.placement.kind === "direct-contract", "Commerce placement mode mismatch");
  invariant(entry.productCommitment === offer.product.commitment && isAddressEqual(entry.payee, offer.merchant.payee) &&
    isAddressEqual(entry.paymentAsset, offer.payment.asset) &&
    entry.exactAtomicAmount === offer.payment.atomicAmount, "Commerce merchant semantics mismatch");

  const abiItem = parseAbiItem(`function ${entry.placement.functionSignature}`);
  invariant(abiItem.type === "function", "Commerce ABI item is not a function");
  const args = entry.placement.argumentBindings.map((binding) => boundArgument(binding, { program, policy, offer }));
  const data = concatHex([
    entry.placement.selector,
    encodeAbiParameters(abiItem.inputs, args),
  ]);
  invariant(data.slice(0, 10).toLowerCase() === entry.placement.selector, "Commerce selector mismatch");
  invariant(size(data) <= policy.limits.maxActionCalldataBytes, "Commerce calldata limit exceeded");
  invariant(entry.placement.expectedGas <= policy.limits.maxExpectedGas, "Commerce gas limit exceeded");

  const deployments = [{
    address: entry.placement.target,
    runtimeCodeHash: entry.placement.runtimeCodeHash,
    ...(entry.placement.implementation ? { implementation: entry.placement.implementation } : {}),
  }];
  return {
    capabilityId: "commerce.order.place",
    capabilityVersion: 1,
    target: entry.placement.target,
    selector: entry.placement.selector,
    data,
    expectedGas: entry.placement.expectedGas,
    spend: [{ token: offer.payment.asset, atomic: offer.payment.atomicAmount }],
    guaranteedOutputs: [],
    deployments,
    evidencePredicates: [entry.receipt],
  };
}
