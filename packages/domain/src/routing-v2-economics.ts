import { isAddressEqual } from "viem";
import type { RoutePlanV2 } from "./routing-v2-plan";
import type { StablecoinPolicyV2 } from "./routing-v2-policy";
import type {
  AssetValuationV2,
  RouteOpportunityV2,
  RouteSnapshotV2,
} from "./routing-v2-snapshot";

const BPS_SCALE = 10_000n;
const DAYS_PER_YEAR = 365n;

export interface RouteEconomicsV2 {
  estimatedPreGasApyBps: number;
  positiveGain: boolean;
}

interface ComputedRouteEconomicsV2 {
  economics: RouteEconomicsV2;
  annualizedGainNumerator: bigint;
}

function atomicUsdE8(amount: string, valuation: AssetValuationV2): bigint {
  return BigInt(amount) * BigInt(valuation.priceUsdE8) /
    (10n ** BigInt(valuation.decimals));
}

function requireValuation(
  snapshot: RouteSnapshotV2,
  asset: AssetValuationV2["asset"],
): AssetValuationV2 {
  const valuation = snapshot.valuations.find((candidate) =>
    isAddressEqual(candidate.asset, asset)
  );
  if (!valuation) throw new Error(`Missing valuation for ${asset}`);
  return valuation;
}

function requireOpportunity<TKind extends RouteOpportunityV2["kind"]>(
  snapshot: RouteSnapshotV2,
  id: string,
  kind: TKind,
): Extract<RouteOpportunityV2, { kind: TKind }> {
  const opportunity = snapshot.opportunities.find((candidate) => candidate.id === id);
  if (!opportunity || opportunity.kind !== kind) {
    throw new Error(`Missing ${kind} opportunity ${id}`);
  }
  return opportunity as Extract<RouteOpportunityV2, { kind: TKind }>;
}

function safeApy(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Pre-gas APY exceeds the safe integer range");
  }
  return Number(value);
}

/**
 * Recomputes optimistic, pre-gas route economics from committed snapshot data.
 * A non-positive gain is kept at zero; it is never presented as yield.
 */
function computeRouteEconomicsV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  plan: RoutePlanV2,
): ComputedRouteEconomicsV2 {
  const leg = plan.legs[0];
  if (!leg) {
    return {
      economics: { estimatedPreGasApyBps: 0, positiveGain: false },
      annualizedGainNumerator: 0n,
    };
  }

  const inputValuation = requireValuation(snapshot, policy.asset);
  const principalValue = atomicUsdE8(policy.principalAtomic, inputValuation);
  if (principalValue === 0n) throw new Error("Input asset USD value rounds to zero");

  const [first, second] = leg.actions;
  const deployedValue = atomicUsdE8(leg.inputAtomic, inputValuation);
  let gainNumerator: bigint;

  if (first.kind === "aave-v3-supply") {
    const supply = requireOpportunity(snapshot, first.opportunityId, first.kind);
    gainNumerator = deployedValue * BigInt(supply.supplyRateBps) *
      BigInt(policy.horizonDays);
  } else if (first.kind === "uniswap-v3-exact-input" ||
    first.kind === "curve-stableswap-ng-exact-input") {
    const swap = requireOpportunity(snapshot, first.opportunityId, first.kind);
    if (second?.kind !== "aave-v3-supply") {
      throw new Error("Swap route is missing its supply action");
    }
    const supply = requireOpportunity(snapshot, second.opportunityId, "aave-v3-supply");
    const outputValuation = requireValuation(snapshot, swap.tokenOut);
    const outputValue = atomicUsdE8(swap.quotedOutputAtomic, outputValuation);
    gainNumerator =
      (outputValue - deployedValue) * BPS_SCALE * DAYS_PER_YEAR +
      outputValue * BigInt(supply.supplyRateBps) * BigInt(policy.horizonDays);
  } else {
    const lp = requireOpportunity(snapshot, first.opportunityId, "uniswap-v3-full-range-lp");
    const outputValuation = requireValuation(snapshot, first.tokenOut);
    const outputValue = atomicUsdE8(first.quotedOutputAtomic, outputValuation);
    const retainedInputAtomic = BigInt(leg.inputAtomic) - BigInt(first.inputAtomic);
    const retainedInputValue = atomicUsdE8(
      retainedInputAtomic.toString(),
      inputValuation,
    );
    const lpValue = retainedInputValue + outputValue;
    gainNumerator =
      (lpValue - deployedValue) * BPS_SCALE * DAYS_PER_YEAR +
      lpValue * BigInt(lp.historicalFeeApyBps) * BigInt(policy.horizonDays);
  }

  if (gainNumerator <= 0n) {
    return {
      economics: { estimatedPreGasApyBps: 0, positiveGain: false },
      annualizedGainNumerator: gainNumerator,
    };
  }
  const apy = gainNumerator /
    (principalValue * BigInt(policy.horizonDays));
  return {
    economics: {
      estimatedPreGasApyBps: safeApy(apy),
      positiveGain: true,
    },
    annualizedGainNumerator: gainNumerator,
  };
}

export function estimateRouteEconomicsV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  plan: RoutePlanV2,
): RouteEconomicsV2 {
  return computeRouteEconomicsV2(policy, snapshot, plan).economics;
}

export function compareRouteEconomicsV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
  left: RoutePlanV2,
  right: RoutePlanV2,
): number {
  const leftGain = computeRouteEconomicsV2(
    policy,
    snapshot,
    left,
  ).annualizedGainNumerator;
  const rightGain = computeRouteEconomicsV2(
    policy,
    snapshot,
    right,
  ).annualizedGainNumerator;
  if (leftGain === rightGain) return 0;
  return leftGain > rightGain ? -1 : 1;
}
