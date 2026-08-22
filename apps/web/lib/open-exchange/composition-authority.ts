import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  GeneralBalanceConstraintV2Schema,
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { CapabilityActionV1Schema } from "@cobia/solvers";
import { isAddressEqual, type Address } from "viem";
import { z } from "zod";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";

const SelectionSchema = z.object({
  inputAtomic: z.string().regex(/^[1-9][0-9]*$/),
  actions: z.array(CapabilityActionV1Schema).min(1).max(8),
  balanceConstraints: z.array(GeneralBalanceConstraintV2Schema).min(1).max(8),
}).strict();
const AaveParametersSchema = z.object({
  asset: z.string(),
  amountAtomic: z.string().regex(/^[1-9][0-9]*$/),
}).strict();
const SwapParametersSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountInAtomic: z.string().regex(/^[1-9][0-9]*$/),
  minimumOutputAtomic: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

function registeredUnderlying(address: string) {
  const value = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, address as Address));
  if (!value) throw new Error("Composition asset is not registered");
  return value;
}

function valuation(snapshot: z.infer<typeof CapabilityCompositionSnapshotV1Schema>, address: string) {
  const value = snapshot.route.valuations.find(({ asset }) =>
    isAddressEqual(asset, address as Address));
  if (!value) throw new Error("Composition asset valuation is unavailable");
  return value;
}

function usdE8(atomic: string, value: ReturnType<typeof valuation>): bigint {
  return BigInt(atomic) * BigInt(value.priceUsdE8) / 10n ** BigInt(value.decimals);
}

export function deriveCompositionAuthorityV1(
  policyInput: unknown,
  snapshotInput: unknown,
  selectionInput: unknown,
) {
  const policy = CapabilityCompositionPolicyV1Schema.parse(policyInput);
  const snapshot = CapabilityCompositionSnapshotV1Schema.parse(snapshotInput);
  const selection = SelectionSchema.parse(selectionInput);
  const manifest = productionCapabilityManifestV1();
  if (snapshot.requestId !== policy.requestId ||
      snapshot.manifestHash !== policy.manifestHash ||
      policy.manifestHash !== commitment(manifest) ||
      snapshot.route.adapterRegistryHash !== registryHash) {
    throw new Error("Composition snapshot authority mismatch");
  }
  if (BigInt(selection.inputAtomic) > BigInt(policy.input.maxAtomic)) {
    throw new Error("Composition input exceeds the signed maximum");
  }
  const allowedCapabilities = new Set(policy.allowedCapabilities.map(
    ({ id, version }) => `${id}@${version}`,
  ));
  if (selection.actions.some(({ capabilityId, capabilityVersion }) =>
    !allowedCapabilities.has(`${capabilityId}@${capabilityVersion}`))) {
    throw new Error("Composition action is not allowed");
  }
  const terminal = selection.actions.at(-1);
  if (terminal?.capabilityId !== "aave-v3.supply" || selection.actions.length > 2) {
    throw new Error("Yield composition requires one terminal Aave supply");
  }
  const supply = AaveParametersSchema.parse(terminal.parameters);
  const suppliedAsset = registeredUnderlying(supply.asset);
  if (!policy.allowedAssets.some((asset) => isAddressEqual(asset, suppliedAsset.underlying.address))) {
    throw new Error("Supplied asset is not allowed");
  }
  const supplyOpportunity = snapshot.route.opportunities.find((opportunity) =>
    opportunity.kind === "aave-v3-supply" &&
    isAddressEqual(opportunity.asset, suppliedAsset.underlying.address) &&
    opportunity.validatedSupplyAtomic === supply.amountAtomic);
  if (!supplyOpportunity) throw new Error("Aave supply opportunity is not committed");

  if (selection.actions.length === 1) {
    if (!isAddressEqual(suppliedAsset.underlying.address, policy.input.token) ||
        supply.amountAtomic !== selection.inputAtomic) {
      throw new Error("Direct supply does not conserve the selected input");
    }
  } else {
    const swapAction = selection.actions[0]!;
    if (swapAction.capabilityId !== "curve-stableswap-ng.exact-input" &&
        swapAction.capabilityId !== "uniswap-v3.exact-input") {
      throw new Error("Yield composition supports one registered exact-input swap");
    }
    const swap = SwapParametersSchema.parse(swapAction.parameters);
    const opportunityKind = swapAction.capabilityId.startsWith("curve")
      ? "curve-stableswap-ng-exact-input" : "uniswap-v3-exact-input";
    const opportunity = snapshot.route.opportunities.find((candidate) =>
      candidate.kind === opportunityKind &&
      isAddressEqual(candidate.tokenIn, swap.tokenIn as Address) &&
      isAddressEqual(candidate.tokenOut, swap.tokenOut as Address) &&
      candidate.quotedInputAtomic === swap.amountInAtomic &&
      candidate.quotedOutputAtomic === swap.minimumOutputAtomic);
    if (!opportunity || !isAddressEqual(swap.tokenIn as Address, policy.input.token) ||
        !isAddressEqual(swap.tokenOut as Address, suppliedAsset.underlying.address) ||
        swap.amountInAtomic !== selection.inputAtomic ||
        supply.amountAtomic !== swap.minimumOutputAtomic) {
      throw new Error("Swap route does not match a committed opportunity");
    }
    const loss = policy.constraints.find((constraint) =>
      constraint.kind === "maximum-conversion-loss")!;
    const inputValue = usdE8(swap.amountInAtomic, valuation(snapshot, swap.tokenIn));
    const outputValue = usdE8(swap.minimumOutputAtomic, valuation(snapshot, swap.tokenOut));
    if (outputValue * 10_000n < inputValue * BigInt(10_000 - loss.maximumLossBps)) {
      throw new Error("Swap route exceeds the signed conversion loss");
    }
  }

  if (selection.balanceConstraints.length !== 1) {
    throw new Error("Composition requires one exact receipt constraint");
  }
  const receipt = selection.balanceConstraints[0]!;
  const guaranteedReceipt = BigInt(supply.amountAtomic) > 1n
    ? BigInt(supply.amountAtomic) - 1n : BigInt(supply.amountAtomic);
  if (receipt.kind !== "minimumIncrease" ||
      !isAddressEqual(receipt.token, suppliedAsset.aToken.address) ||
      BigInt(receipt.atomic) > guaranteedReceipt) {
    throw new Error("Composition receipt constraint is not guaranteed");
  }
  const receiptFloor = policy.constraints.find((constraint) =>
    constraint.kind === "minimum-registered-receipt-value")!;
  const inputValue = usdE8(policy.input.maxAtomic, valuation(snapshot, policy.input.token));
  const receiptValue = usdE8(receipt.atomic, valuation(snapshot, suppliedAsset.underlying.address));
  if (receiptValue * 10_000n < inputValue * BigInt(receiptFloor.minimumValueBps)) {
    throw new Error("Composition receipt value is below the signed floor");
  }

  const derivedPolicy = GeneralIntentPolicyV2Schema.parse({
    version: 2, kind: "general-onchain", requestId: policy.requestId,
    displayGoal: policy.displayGoal, owner: policy.owner, executionChainId: 196,
    nonce: policy.nonce, createdAt: policy.createdAt, deadline: policy.deadline,
    competition: policy.competition, maxEvidenceAgeSec: policy.maxEvidenceAgeSec,
    manifestHash: policy.manifestHash, input: { token: policy.input.token,
      maxAtomic: policy.input.maxAtomic },
    allowedCapabilities: policy.allowedCapabilities,
    limits: { maxActions: policy.limits.maxActions,
      maxApprovals: policy.limits.maxApprovals,
      maxActionCalldataBytes: policy.limits.maxActionCalldataBytes,
      maxExpectedGas: policy.limits.maxExpectedGas },
    forbiddenTargets: policy.forbiddenTargets,
    forbiddenAssets: policy.forbiddenAssets,
    balanceConstraints: selection.balanceConstraints,
    predicates: [], objective: { kind: "satisfy" },
  });
  const anchor = snapshot.route;
  const derivedSnapshot = GeneralIntentSnapshotV1Schema.parse({
    version: 1, kind: "general-onchain", requestId: policy.requestId, chainId: 196,
    blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
    capturedAt: snapshot.capturedAt, manifestHash: policy.manifestHash,
  });
  return { policy: derivedPolicy, snapshot: derivedSnapshot, manifest };
}
