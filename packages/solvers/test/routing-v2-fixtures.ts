import type {
  RouteSnapshotV2,
  StablecoinPolicyV2,
} from "@cobia/domain";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const routeSolverAccount = privateKeyToAccount(
  keccak256(toHex("cobia-route-solver-test-signer")),
);
export const routeNowSec = 1_800_000_000;
export const routeRegistryHash = `0x${"ab".repeat(32)}` as const;
export const routeInputAsset = "0x1111111111111111111111111111111111111111";
export const routeOutputAsset = "0x2222222222222222222222222222222222222222";

export const routePolicy: StablecoinPolicyV2 = {
  version: 2,
  requestId: "550e8400-e29b-41d4-a716-446655440010",
  owner: "0x3333333333333333333333333333333333333333",
  executionChainId: 196,
  asset: routeInputAsset,
  principalAtomic: "100000000",
  protocolExposureBps: 5_000,
  minTvlUsdE6: "1000000000",
  minPreGasApyBps: 0,
  maxSnapshotAgeSec: 300,
  deadline: 1_800_000_600,
  noBridges: true,
  allowedOutputAssets: [routeInputAsset, routeOutputAsset],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 100,
  horizonDays: 30,
};

export const routeSnapshot: RouteSnapshotV2 = {
  version: 2,
  requestId: routePolicy.requestId,
  chainId: 196,
  blockNumber: "67649517",
  blockHash: `0x${"cd".repeat(32)}`,
  capturedAt: "2027-01-15T07:59:00.000Z",
  adapterRegistryHash: routeRegistryHash,
  scannedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  valuations: [
    { asset: routeInputAsset, decimals: 6, priceUsdE8: "100000000" },
    { asset: routeOutputAsset, decimals: 6, priceUsdE8: "100000000" },
  ],
  opportunities: [
    {
      id: "aave:input",
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: routeInputAsset,
      supplyRateBps: 500,
      tvlUsdE6: "100000000000",
      availableLiquidityAtomic: "100000000",
      validatedSupplyAtomic: "50000000",
    },
    {
      id: "swap:input-output:50000000",
      kind: "uniswap-v3-exact-input",
      adapterId: "uniswap-v3@1",
      tokenIn: routeInputAsset,
      tokenOut: routeOutputAsset,
      feeTier: 100,
      quotedInputAtomic: "50000000",
      quotedOutputAtomic: "49900000",
      estimatedGas: "100000",
    },
    {
      id: "aave:output",
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: routeOutputAsset,
      supplyRateBps: 1_000,
      tvlUsdE6: "100000000000",
      availableLiquidityAtomic: "100000000",
      validatedSupplyAtomic: "49401000",
    },
  ],
};

export const routeBuilderOptions = {
  solverId: "determinist-v2",
  solverAddress: routeSolverAccount.address,
  expectedAdapterRegistryHash: routeRegistryHash,
} as const;
