import type { RouteOpportunityV2 } from "@cobia/domain";

export function protocolLabelV2(kind: RouteOpportunityV2["kind"]): string {
  if (kind === "aave-v3-supply") return "Aave V3";
  if (kind === "curve-stableswap-ng-exact-input") return "Curve StableSwap NG";
  return "Uniswap V3";
}
