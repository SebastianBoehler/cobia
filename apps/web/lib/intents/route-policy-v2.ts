import { StablecoinPolicyV2Schema, type StablecoinPolicyV2 } from "@cobia/domain";
import type { Address } from "viem";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";

interface RoutePolicyV2Input {
  requestId: string;
  owner: Address;
  asset: Address;
  principalAtomic: string;
  protocolExposureBps: number;
  minTvlUsdE6: string;
  minPreGasApyBps: number;
  nowSec: number;
}

export const ProductRoutePolicyV2Schema = StablecoinPolicyV2Schema.refine(
  ({ minPreGasApyBps }) => minPreGasApyBps >= 1,
  {
    path: ["minPreGasApyBps"],
    message: "Minimum pre-gas APY must be positive",
  },
);

export const ROUTE_POLICY_V2_DEFAULTS = Object.freeze({
  maxSnapshotAgeSec: 300,
  deadlineLifetimeSec: 1_800,
  noBridges: true,
  allowedOutputAssets: Object.freeze(
    SUPPORTED_ASSETS.map(({ address }) => address.toLowerCase()).sort(),
  ),
  allowedAdapters: Object.freeze(["aave-v3@1", "uniswap-v3@1"] as const),
  maxSlippageBps: 50,
  horizonDays: 30,
});

export function buildRoutePolicyV2(input: RoutePolicyV2Input): StablecoinPolicyV2 {
  return ProductRoutePolicyV2Schema.parse({
    version: 2,
    requestId: input.requestId,
    owner: input.owner,
    executionChainId: 196,
    asset: input.asset,
    principalAtomic: input.principalAtomic,
    protocolExposureBps: input.protocolExposureBps,
    minTvlUsdE6: input.minTvlUsdE6,
    minPreGasApyBps: input.minPreGasApyBps,
    maxSnapshotAgeSec: ROUTE_POLICY_V2_DEFAULTS.maxSnapshotAgeSec,
    deadline: input.nowSec + ROUTE_POLICY_V2_DEFAULTS.deadlineLifetimeSec,
    noBridges: ROUTE_POLICY_V2_DEFAULTS.noBridges,
    allowedOutputAssets: [...ROUTE_POLICY_V2_DEFAULTS.allowedOutputAssets],
    allowedAdapters: [...ROUTE_POLICY_V2_DEFAULTS.allowedAdapters],
    maxSlippageBps: ROUTE_POLICY_V2_DEFAULTS.maxSlippageBps,
    horizonDays: ROUTE_POLICY_V2_DEFAULTS.horizonDays,
  });
}
