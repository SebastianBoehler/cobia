import type { Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import type { CapabilityTemplateId } from "./capability-templates";

export type ActionPreference = "any" | CapabilityTemplateId | "service-purchase";
export type ProtocolExclusionId = "aave-v3" | "curve" | "uniswap-v3";

export const ACTION_PREFERENCES: readonly { id: ActionPreference; label: string }[] = [
  { id: "any", label: "Any action" },
  { id: "aave-supply", label: "Earn" },
  { id: "exact-input-swap", label: "Swap" },
  { id: "round-trip", label: "Round trip" },
  { id: "rwa-acquisition", label: "RWA" },
  { id: "service-purchase", label: "Buy service" },
];

export const PROTOCOL_EXCLUSIONS: readonly {
  id: ProtocolExclusionId;
  label: string;
  targets: readonly Address[];
}[] = [
  { id: "aave-v3", label: "Aave V3", targets: [PROTOCOL_REGISTRY.aaveV3.pool.address] },
  { id: "curve", label: "Curve", targets: [PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address] },
  { id: "uniswap-v3", label: "Uniswap V3", targets: [
    PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
    PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address,
  ] },
];

export function protocolForbiddenTargets(ids: readonly ProtocolExclusionId[]): Address[] {
  const selected = new Set(ids);
  return PROTOCOL_EXCLUSIONS.flatMap((protocol) => selected.has(protocol.id) ? protocol.targets : [])
    .map((target) => target.toLowerCase() as Address)
    .sort();
}
