import { isAddressEqual } from "viem";
import type { RoutePlanV2 } from "./routing-v2-plan";
import {
  routeObjectiveV2,
  type StablecoinPolicyV2,
} from "./routing-v2-policy";
import type { RouteSnapshotV2 } from "./routing-v2-snapshot";
import type { RoutePolicyErrorCodeV2 } from "./routing-v2-assess";

type ExactSwapAction = Extract<
  RoutePlanV2["legs"][number]["actions"][number],
  { kind: "uniswap-v3-exact-input" | "curve-stableswap-ng-exact-input" }
>;

function exactSwap(action: RoutePlanV2["legs"][number]["actions"][number] | undefined):
  action is ExactSwapAction {
  return action?.kind === "uniswap-v3-exact-input" ||
    action?.kind === "curve-stableswap-ng-exact-input";
}

function outputAllowed(policy: StablecoinPolicyV2, output: `0x${string}`): boolean {
  return policy.allowedOutputAssets.some((asset) => isAddressEqual(asset, output));
}

function exceedsSlippage(action: ExactSwapAction, policy: StablecoinPolicyV2): boolean {
  const quoted = BigInt(action.quotedOutputAtomic);
  const minimum = BigInt(action.minimumOutputAtomic);
  return (quoted - minimum) * 10_000n > quoted * BigInt(policy.maxSlippageBps);
}

function assessBoundOpportunity(
  action: ExactSwapAction,
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  errors: RoutePolicyErrorCodeV2[],
): void {
  const opportunity = snapshot.opportunities.find(({ id }) => id === action.opportunityId);
  if (!opportunity) {
    errors.push("UNKNOWN_OPPORTUNITY");
    return;
  }
  if (opportunity.kind !== action.kind) {
    errors.push("OPPORTUNITY_KIND_MISMATCH");
    return;
  }
  if (!policy.allowedAdapters.includes(opportunity.adapterId)) {
    errors.push("ADAPTER_NOT_ALLOWED");
  }
  if (!outputAllowed(policy, action.tokenOut)) errors.push("OUTPUT_ASSET_NOT_ALLOWED");
  if (exceedsSlippage(action, policy)) errors.push("SLIPPAGE_LIMIT_EXCEEDED");
  if (!isAddressEqual(opportunity.tokenIn, action.tokenIn) ||
    !isAddressEqual(opportunity.tokenOut, action.tokenOut)) {
    errors.push("OPPORTUNITY_ROUTE_MISMATCH");
  }
  if (opportunity.quotedInputAtomic !== action.inputAtomic ||
    opportunity.quotedOutputAtomic !== action.quotedOutputAtomic) {
    errors.push("OPPORTUNITY_QUOTE_MISMATCH");
  }
  if (action.kind === "curve-stableswap-ng-exact-input" &&
    opportunity.kind === "curve-stableswap-ng-exact-input" &&
    (!isAddressEqual(opportunity.pool, action.pool) ||
      opportunity.inputIndex !== action.inputIndex ||
      opportunity.outputIndex !== action.outputIndex ||
      opportunity.fee !== action.fee)) {
    errors.push("OPPORTUNITY_ROUTE_MISMATCH");
  }
}

export function assessRouteObjectiveV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  plan: RoutePlanV2,
): RoutePolicyErrorCodeV2[] {
  const objective = routeObjectiveV2(policy);
  if (objective.kind === "earn") return [];
  const errors: RoutePolicyErrorCodeV2[] = [];
  const actions = plan.legs[0]?.actions;
  const first = actions?.[0];
  if (!actions || !exactSwap(first)) return ["OBJECTIVE_ROUTE_MISMATCH"];

  if (objective.kind === "swap") {
    if (actions.length !== 1 || !isAddressEqual(first.tokenOut, objective.outputAsset)) {
      errors.push("OBJECTIVE_ROUTE_MISMATCH");
    }
    if (BigInt(first.minimumOutputAtomic) < BigInt(objective.minimumOutputAtomic)) {
      errors.push("OBJECTIVE_MINIMUM_NOT_MET");
    }
    if (!outputAllowed(policy, first.tokenOut)) errors.push("OUTPUT_ASSET_NOT_ALLOWED");
    return errors;
  }

  const second = actions[1];
  if (actions.length !== 2 || !exactSwap(second) ||
    !isAddressEqual(second.tokenOut, policy.asset)) {
    return ["OBJECTIVE_ROUTE_MISMATCH"];
  }
  if (BigInt(second.minimumOutputAtomic) < BigInt(objective.minimumFinalAtomic)) {
    errors.push("OBJECTIVE_MINIMUM_NOT_MET");
  }
  assessBoundOpportunity(second, policy, snapshot, errors);
  return errors;
}
