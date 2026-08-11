import type {
  RouteSnapshotV2,
  StablecoinPolicyV2,
} from "@cobia/domain";
import { createDeterministicRouteSolverV2 } from "@cobia/solvers";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";

export const routeAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const secondRouteAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
export const routeNowSec = 1_900_000_000;
const lowerAddress = (address: Address) => address.toLowerCase() as Address;
export const routeUsdg = lowerAddress(
  PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address,
);
export const routeUsdt0 = lowerAddress(
  PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address,
);

export function routeMarketFixtures(): {
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
} {
  const requestId = crypto.randomUUID();
  const policy: StablecoinPolicyV2 = {
    version: 2,
    requestId,
    owner: "0x1111111111111111111111111111111111111111",
    executionChainId: 196,
    asset: routeUsdt0,
    principalAtomic: "100000000",
    protocolExposureBps: 5_000,
    minTvlUsdE6: "1000000",
    minPreGasApyBps: 0,
    maxSnapshotAgeSec: 300,
    deadline: routeNowSec + 1_800,
    noBridges: true,
    allowedOutputAssets: [routeUsdg, routeUsdt0],
    allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
    maxSlippageBps: 100,
    horizonDays: 30,
  };
  return {
    policy,
    snapshot: {
      version: 2,
      requestId,
      chainId: 196,
      blockNumber: "1",
      blockHash: `0x${"ab".repeat(32)}`,
      capturedAt: new Date(routeNowSec * 1_000).toISOString(),
      adapterRegistryHash: registryHash,
      scannedAdapters: ["aave-v3@1", "uniswap-v3@1"],
      valuations: [
        { asset: routeUsdg, decimals: 6, priceUsdE8: "100000000" },
        { asset: routeUsdt0, decimals: 6, priceUsdE8: "100000000" },
      ],
      opportunities: [
        {
          id: "aave:usdt0",
          kind: "aave-v3-supply",
          adapterId: "aave-v3@1",
          asset: routeUsdt0,
          supplyRateBps: 20,
          tvlUsdE6: "1000000000",
          availableLiquidityAtomic: "1",
          validatedSupplyAtomic: "50000000",
        },
        {
          id: "swap:usdt0-usdg",
          kind: "uniswap-v3-exact-input",
          adapterId: "uniswap-v3@1",
          tokenIn: routeUsdt0,
          tokenOut: routeUsdg,
          feeTier: 100,
          quotedInputAtomic: "50000000",
          quotedOutputAtomic: "49900000",
          estimatedGas: "100000",
        },
        {
          id: "aave:usdg",
          kind: "aave-v3-supply",
          adapterId: "aave-v3@1",
          asset: routeUsdg,
          supplyRateBps: 40,
          tvlUsdE6: "1000000000",
          availableLiquidityAtomic: "1",
          validatedSupplyAtomic: "49900000",
        },
      ],
    },
  };
}

export function healthyRouteSolver() {
  return createDeterministicRouteSolverV2({
    solverId: "deterministic-v2",
    account: routeAccount,
    expectedAdapterRegistryHash: registryHash,
  });
}
