import { isAddressEqual, type Address, type Hash } from "viem";
import { commitment } from "./canonical";
import type { RouteBundleV2 } from "./routing-v2-bundle";
import type { StablecoinPolicyV2 } from "./routing-v2-policy";
import type {
  RouteOpportunityV2,
  RouteSnapshotV2,
} from "./routing-v2-snapshot";

export type RoutePolicyErrorCodeV2 =
  | "REQUEST_ID_MISMATCH"
  | "POLICY_HASH_MISMATCH"
  | "SNAPSHOT_HASH_MISMATCH"
  | "ADAPTER_REGISTRY_MISMATCH"
  | "ADAPTER_SCAN_INCOMPLETE"
  | "INPUT_ASSET_MISMATCH"
  | "PRINCIPAL_MISMATCH"
  | "HORIZON_MISMATCH"
  | "PROTOCOL_EXPOSURE_MISMATCH"
  | "OUTPUT_ASSET_NOT_ALLOWED"
  | "ADAPTER_NOT_ALLOWED"
  | "UNKNOWN_OPPORTUNITY"
  | "OPPORTUNITY_KIND_MISMATCH"
  | "OPPORTUNITY_ROUTE_MISMATCH"
  | "OPPORTUNITY_QUOTE_MISMATCH"
  | "OPPORTUNITY_AMOUNT_MISMATCH"
  | "TVL_BELOW_MINIMUM"
  | "SLIPPAGE_LIMIT_EXCEEDED";

export interface RouteAuthorizationAssessmentV2 {
  authorizationValid: boolean;
  errorCodes: RoutePolicyErrorCodeV2[];
}

export interface RouteAuthorizationContextV2 {
  expectedAdapterRegistryHash: Hash;
}

export type RouteAuthorizationBundleV2 = Omit<RouteBundleV2, "signature">;

function add(
  errors: RoutePolicyErrorCodeV2[],
  code: RoutePolicyErrorCodeV2,
): void {
  if (!errors.includes(code)) errors.push(code);
}

function addressAllowed(address: Address, allowed: readonly Address[]): boolean {
  return allowed.some((candidate) => isAddressEqual(candidate, address));
}

function assessOpportunityBase(
  opportunity: RouteOpportunityV2 | undefined,
  expectedKind: RouteOpportunityV2["kind"],
  policy: StablecoinPolicyV2,
  errors: RoutePolicyErrorCodeV2[],
): opportunity is RouteOpportunityV2 {
  if (!opportunity) {
    add(errors, "UNKNOWN_OPPORTUNITY");
    return false;
  }
  if (opportunity.kind !== expectedKind) {
    add(errors, "OPPORTUNITY_KIND_MISMATCH");
    return false;
  }
  if (!policy.allowedAdapters.includes(opportunity.adapterId)) {
    add(errors, "ADAPTER_NOT_ALLOWED");
  }
  return true;
}

function assessSupply(
  opportunity: RouteOpportunityV2 | undefined,
  asset: Address,
  amountAtomic: string,
  policy: StablecoinPolicyV2,
  errors: RoutePolicyErrorCodeV2[],
): void {
  if (!addressAllowed(asset, policy.allowedOutputAssets)) {
    add(errors, "OUTPUT_ASSET_NOT_ALLOWED");
  }
  if (!assessOpportunityBase(opportunity, "aave-v3-supply", policy, errors)) return;
  if (opportunity.kind !== "aave-v3-supply") return;
  if (!isAddressEqual(opportunity.asset, asset)) {
    add(errors, "OPPORTUNITY_ROUTE_MISMATCH");
  }
  if (opportunity.validatedSupplyAtomic !== amountAtomic) {
    add(errors, "OPPORTUNITY_AMOUNT_MISMATCH");
  }
  if (BigInt(opportunity.tvlUsdE6) < BigInt(policy.minTvlUsdE6)) {
    add(errors, "TVL_BELOW_MINIMUM");
  }
}

/**
 * Checks signed route/adapter/asset constraints only. Rate, gas, signature,
 * simulation, and execution checks are deliberately outside this assessment.
 */
export function assessRouteAuthorizationV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  bundle: RouteAuthorizationBundleV2,
  context: RouteAuthorizationContextV2,
): RouteAuthorizationAssessmentV2 {
  const errors: RoutePolicyErrorCodeV2[] = [];
  const plan = bundle.routePlan;
  const opportunities = new Map(
    snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );

  if (bundle.requestId !== policy.requestId || snapshot.requestId !== policy.requestId) {
    add(errors, "REQUEST_ID_MISMATCH");
  }
  if (bundle.policyHash !== commitment(policy)) add(errors, "POLICY_HASH_MISMATCH");
  if (bundle.snapshotHash !== commitment(snapshot)) add(errors, "SNAPSHOT_HASH_MISMATCH");
  if (
    snapshot.adapterRegistryHash.toLowerCase() !==
    context.expectedAdapterRegistryHash.toLowerCase()
  ) {
    add(errors, "ADAPTER_REGISTRY_MISMATCH");
  }
  if (
    policy.allowedAdapters.some(
      (adapter) => !snapshot.scannedAdapters.includes(adapter),
    )
  ) {
    add(errors, "ADAPTER_SCAN_INCOMPLETE");
  }
  if (!isAddressEqual(plan.inputAsset, policy.asset)) add(errors, "INPUT_ASSET_MISMATCH");
  if (plan.inputAtomic !== policy.principalAtomic) add(errors, "PRINCIPAL_MISMATCH");
  if (plan.horizonDays !== policy.horizonDays) add(errors, "HORIZON_MISMATCH");

  const deployed = BigInt(plan.inputAtomic) - BigInt(plan.retainedAtomic);
  const expectedDeployment = BigInt(plan.inputAtomic) *
    BigInt(policy.protocolExposureBps) / 10_000n;
  if (plan.legs.length > 0 && deployed !== expectedDeployment) {
    add(errors, "PROTOCOL_EXPOSURE_MISMATCH");
  }

  for (const leg of plan.legs) {
    const [first, second] = leg.actions;
    if (first.kind === "aave-v3-supply") {
      assessSupply(
        opportunities.get(first.opportunityId),
        first.asset,
        leg.inputAtomic,
        policy,
        errors,
      );
      continue;
    }

    const swap = opportunities.get(first.opportunityId);
    if (assessOpportunityBase(swap, "uniswap-v3-exact-input", policy, errors)) {
      if (swap.kind === "uniswap-v3-exact-input") {
        const routeMatches =
          isAddressEqual(swap.tokenIn, first.tokenIn) &&
          isAddressEqual(swap.tokenOut, first.tokenOut);
        if (!routeMatches) add(errors, "OPPORTUNITY_ROUTE_MISMATCH");
        if (
          swap.quotedInputAtomic !== leg.inputAtomic ||
          swap.quotedOutputAtomic !== first.quotedOutputAtomic
        ) {
          add(errors, "OPPORTUNITY_QUOTE_MISMATCH");
        }
      }
    }
    const quoted = BigInt(first.quotedOutputAtomic);
    const minimum = BigInt(first.minimumOutputAtomic);
    if (
      (quoted - minimum) * 10_000n >
      quoted * BigInt(policy.maxSlippageBps)
    ) {
      add(errors, "SLIPPAGE_LIMIT_EXCEEDED");
    }
    if (second) {
      assessSupply(
        opportunities.get(second.opportunityId),
        second.asset,
        first.quotedOutputAtomic,
        policy,
        errors,
      );
    }
  }

  return { authorizationValid: errors.length === 0, errorCodes: errors };
}
