import type { RouteBundleV2 } from "@cobia/domain";
import type { Address } from "viem";

export type PublicRouteStepV2 =
  | {
      kind: "swap";
      protocol: "Curve StableSwap NG" | "Uniswap V3";
      tokenIn: Address;
      tokenOut: Address;
      inputAtomic: string;
      quotedOutputAtomic: string;
      minimumOutputAtomic: string;
    }
  | {
      kind: "supply";
      protocol: "Aave V3";
      asset: Address;
      inputAtomic: string;
    }
  | {
      kind: "lp";
      protocol: "Uniswap V3";
      token0: Address;
      token1: Address;
      amount0DesiredAtomic: string;
      amount1DesiredAtomic: string;
      amount0MinAtomic: string;
      amount1MinAtomic: string;
      minimumLiquidity: string;
    };

export interface PublicRouteSummaryV2 {
  version: 2;
  inputAsset: Address;
  inputAtomic: string;
  retainedAtomic: string;
  horizonDays: number;
  steps: PublicRouteStepV2[];
}

export function projectPublicRouteSummaryV2(
  bundle: RouteBundleV2,
): PublicRouteSummaryV2 {
  const steps: PublicRouteStepV2[] = [];
  for (const leg of bundle.routePlan.legs) {
    const [first, second] = leg.actions;
    if (first.kind === "aave-v3-supply") {
      steps.push({
        kind: "supply",
        protocol: "Aave V3",
        asset: first.asset,
        inputAtomic: leg.inputAtomic,
      });
      continue;
    }
    if (first.kind === "uniswap-v3-balance-swap") {
      steps.push({
        kind: "swap",
        protocol: "Uniswap V3",
        tokenIn: first.tokenIn,
        tokenOut: first.tokenOut,
        inputAtomic: first.inputAtomic,
        quotedOutputAtomic: first.quotedOutputAtomic,
        minimumOutputAtomic: first.minimumOutputAtomic,
      });
      if (second?.kind === "uniswap-v3-full-range-mint") {
        steps.push({
          kind: "lp",
          protocol: "Uniswap V3",
          token0: second.token0,
          token1: second.token1,
          amount0DesiredAtomic: second.amount0DesiredAtomic,
          amount1DesiredAtomic: second.amount1DesiredAtomic,
          amount0MinAtomic: second.amount0MinAtomic,
          amount1MinAtomic: second.amount1MinAtomic,
          minimumLiquidity: second.minimumLiquidity,
        });
      }
      continue;
    }
    steps.push({
      kind: "swap",
      protocol: first.kind === "curve-stableswap-ng-exact-input"
        ? "Curve StableSwap NG"
        : "Uniswap V3",
      tokenIn: first.tokenIn,
      tokenOut: first.tokenOut,
      inputAtomic: leg.inputAtomic,
      quotedOutputAtomic: first.quotedOutputAtomic,
      minimumOutputAtomic: first.minimumOutputAtomic,
    });
    if (second?.kind === "aave-v3-supply") {
      steps.push({
        kind: "supply",
        protocol: "Aave V3",
        asset: second.asset,
        inputAtomic: first.quotedOutputAtomic,
      });
    }
  }
  return {
    version: 2,
    inputAsset: bundle.routePlan.inputAsset,
    inputAtomic: bundle.routePlan.inputAtomic,
    retainedAtomic: bundle.routePlan.retainedAtomic,
    horizonDays: bundle.routePlan.horizonDays,
    steps,
  };
}
