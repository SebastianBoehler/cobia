import {
  compareRouteEconomicsV2,
  estimateRouteEconomicsV2,
  type RouteEconomicsV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
  routeObjectiveV2,
} from "@cobia/domain";
import { isAddressEqual, type Address } from "viem";
import { objectiveRouteCandidatesV2 } from "./routing-v2-objective-candidates";

const BPS_SCALE = 10_000n;

export interface RouteCandidateV2 {
  id: string;
  economics: RouteEconomicsV2;
  plan: RoutePlanV2;
}

function minimumAfterSlippage(value: string, slippageBps: number): string {
  const numerator = BigInt(value) * BigInt(10_000 - slippageBps);
  const minimum = (numerator + BPS_SCALE - 1n) / BPS_SCALE;
  return (minimum > 0n ? minimum : 1n).toString();
}

export function noActionCandidateV2(policy: StablecoinPolicyV2): RouteCandidateV2 {
  return {
    id: "no-action",
    economics: { estimatedPreGasApyBps: 0, positiveGain: false },
    plan: {
      version: 2,
      inputAsset: policy.asset,
      inputAtomic: policy.principalAtomic,
      retainedAtomic: policy.principalAtomic,
      horizonDays: policy.horizonDays,
      legs: [],
    },
  };
}

export function routeCandidatesV2(
  policy: StablecoinPolicyV2,
  snapshot: RouteSnapshotV2,
): RouteCandidateV2[] {
  if (routeObjectiveV2(policy).kind !== "earn") {
    return objectiveRouteCandidatesV2(policy, snapshot);
  }
  const principal = BigInt(policy.principalAtomic);
  const deployed = principal * BigInt(policy.protocolExposureBps) / BPS_SCALE;
  const retained = principal - deployed;
  if (deployed === 0n) return [];
  const candidates: RouteCandidateV2[] = [];
  const add = (id: string, plan: RoutePlanV2) => candidates.push({
    id,
    economics: estimateRouteEconomicsV2(policy, snapshot, plan),
    plan,
  });
  const allowed = (asset: Address) => policy.allowedOutputAssets.some(
    (candidate) => isAddressEqual(candidate, asset),
  );
  const supplyEligible = (
    supply: Extract<RouteSnapshotV2["opportunities"][number], { kind: "aave-v3-supply" }>,
    asset: Address,
    amountAtomic: string,
  ) => policy.allowedAdapters.includes(supply.adapterId) && allowed(asset) &&
    isAddressEqual(supply.asset, asset) &&
    supply.validatedSupplyAtomic === amountAtomic &&
    BigInt(supply.tvlUsdE6) >= BigInt(policy.minTvlUsdE6);

  for (const supply of snapshot.opportunities) {
    if (supply.kind !== "aave-v3-supply" ||
      !supplyEligible(supply, policy.asset, deployed.toString())) continue;
    add(`direct:${supply.id}`, {
      version: 2,
      inputAsset: policy.asset,
      inputAtomic: policy.principalAtomic,
      retainedAtomic: retained.toString(),
      horizonDays: policy.horizonDays,
      legs: [{
        id: "direct-supply",
        inputAtomic: deployed.toString(),
        actions: [{
          kind: "aave-v3-supply",
          opportunityId: supply.id,
          consume: "all",
          asset: supply.asset,
        }],
      }],
    });
  }

  for (const swap of snapshot.opportunities) {
    if ((swap.kind !== "uniswap-v3-exact-input" &&
      swap.kind !== "curve-stableswap-ng-exact-input") ||
      !policy.allowedAdapters.includes(swap.adapterId) ||
      !isAddressEqual(swap.tokenIn, policy.asset) || !allowed(swap.tokenOut) ||
      swap.quotedInputAtomic !== deployed.toString()) continue;
    const minimumOutputAtomic = minimumAfterSlippage(
      swap.quotedOutputAtomic,
      policy.maxSlippageBps,
    );
    for (const supply of snapshot.opportunities) {
      if (supply.kind !== "aave-v3-supply" ||
        !supplyEligible(supply, swap.tokenOut, minimumOutputAtomic)) continue;
      const swapAction = swap.kind === "curve-stableswap-ng-exact-input"
        ? {
          kind: swap.kind,
          opportunityId: swap.id,
          consume: "all" as const,
          pool: swap.pool,
          tokenIn: swap.tokenIn,
          tokenOut: swap.tokenOut,
          inputIndex: swap.inputIndex,
          outputIndex: swap.outputIndex,
          fee: swap.fee,
          quotedOutputAtomic: swap.quotedOutputAtomic,
          minimumOutputAtomic,
        }
        : {
          kind: swap.kind,
          opportunityId: swap.id,
          consume: "all" as const,
          tokenIn: swap.tokenIn,
          tokenOut: swap.tokenOut,
          quotedOutputAtomic: swap.quotedOutputAtomic,
          minimumOutputAtomic,
        };
      add(`${swap.kind.startsWith("curve") ? "curve" : "swap"}:${swap.id}:${supply.id}`, {
        version: 2,
        inputAsset: policy.asset,
        inputAtomic: policy.principalAtomic,
        retainedAtomic: retained.toString(),
        horizonDays: policy.horizonDays,
        legs: [{
          id: "swap-then-supply",
          inputAtomic: deployed.toString(),
          actions: [swapAction, {
            kind: "aave-v3-supply",
            opportunityId: supply.id,
            consume: "all",
            asset: supply.asset,
          }],
        }],
      });
    }
  }

  for (const lp of snapshot.opportunities) {
    if (lp.kind !== "uniswap-v3-full-range-lp" ||
      !policy.allowedAdapters.includes(lp.adapterId) ||
      BigInt(lp.tvlUsdE6) < BigInt(policy.minTvlUsdE6) ||
      !isAddressEqual(lp.validatedInputAsset, policy.asset) ||
      lp.validatedInputAtomic !== deployed.toString() ||
      !allowed(lp.token0) || !allowed(lp.token1)) continue;
    const inputIsToken0 = isAddressEqual(policy.asset, lp.token0);
    const tokenOut = inputIsToken0 ? lp.token1 : lp.token0;
    add(`lp:${lp.id}`, {
      version: 2,
      inputAsset: policy.asset,
      inputAtomic: policy.principalAtomic,
      retainedAtomic: retained.toString(),
      horizonDays: policy.horizonDays,
      legs: [{
        id: "full-range-lp",
        inputAtomic: deployed.toString(),
        actions: [{
          kind: "uniswap-v3-balance-swap",
          opportunityId: lp.id,
          inputAtomic: lp.balanceSwapInputAtomic,
          tokenIn: policy.asset,
          tokenOut,
          quotedOutputAtomic: lp.quotedSwapOutputAtomic,
          minimumOutputAtomic: minimumAfterSlippage(
            lp.quotedSwapOutputAtomic,
            policy.maxSlippageBps,
          ),
        }, {
          kind: "uniswap-v3-full-range-mint",
          opportunityId: lp.id,
          token0: lp.token0,
          token1: lp.token1,
          feeTier: lp.feeTier,
          tickLower: lp.tickLower,
          tickUpper: lp.tickUpper,
          amount0DesiredAtomic: lp.amount0DesiredAtomic,
          amount1DesiredAtomic: lp.amount1DesiredAtomic,
          amount0MinAtomic: minimumAfterSlippage(
            lp.amount0DesiredAtomic,
            policy.maxSlippageBps,
          ),
          amount1MinAtomic: minimumAfterSlippage(
            lp.amount1DesiredAtomic,
            policy.maxSlippageBps,
          ),
          quotedLiquidity: lp.quotedLiquidity,
          minimumLiquidity: lp.minimumLiquidity,
        }],
      }],
    });
  }

  candidates.sort((left, right) => {
    const order = compareRouteEconomicsV2(
      policy,
      snapshot,
      left.plan,
      right.plan,
    );
    return order !== 0 ? order : left.id.localeCompare(right.id);
  });
  return candidates.filter(({ economics }) => economics.positiveGain &&
    economics.estimatedPreGasApyBps >= policy.minPreGasApyBps);
}
