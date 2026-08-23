import {
  commitment,
  type RouteAuthorizationContextV2,
  type RouteBundleV2,
  type RoutePlanV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "../src/index";

export const requestIdV2 = "550e8400-e29b-41d4-a716-446655440002";
export const ownerV2 = "0x1111111111111111111111111111111111111111";
export const inputAssetV2 = "0x2222222222222222222222222222222222222222";
export const outputAssetV2 = "0x4444444444444444444444444444444444444444";
export const hashV2 = `0x${"ab".repeat(32)}` as const;
export const signatureV2 = `0x${"cd".repeat(65)}` as const;
export const assessmentContextV2: RouteAuthorizationContextV2 = {
  expectedAdapterRegistryHash: hashV2,
};

export const policyV2: StablecoinPolicyV2 = {
  version: 2,
  requestId: requestIdV2,
  owner: ownerV2,
  executionChainId: 196,
  asset: inputAssetV2,
  principalAtomic: "25000001",
  protocolExposureBps: 6_000,
  minTvlUsdE6: "100000000000",
  minPreGasApyBps: 20,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
  allowedOutputAssets: [inputAssetV2, outputAssetV2],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 100,
  horizonDays: 30,
};

export const snapshotV2: RouteSnapshotV2 = {
  version: 2,
  requestId: requestIdV2,
  chainId: 196,
  blockNumber: "67649517",
  blockHash: hashV2,
  capturedAt: "2026-08-09T10:00:00.000Z",
  adapterRegistryHash: hashV2,
  scannedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  valuations: [
    { asset: inputAssetV2, decimals: 6, priceUsdE8: "100000000" },
    { asset: outputAssetV2, decimals: 6, priceUsdE8: "100000000" },
  ],
  opportunities: [
    {
      id: "aave-v3:usdt0",
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: inputAssetV2,
      supplyRateBps: 26,
      tvlUsdE6: "52976308667161",
      availableLiquidityAtomic: "40838937479858",
      validatedSupplyAtomic: "15000000",
    },
    {
      id: "uniswap-v3:usdt0-usdg:100:15000000",
      kind: "uniswap-v3-exact-input",
      adapterId: "uniswap-v3@1",
      tokenIn: inputAssetV2,
      tokenOut: outputAssetV2,
      feeTier: 100,
      quotedInputAtomic: "15000000",
      quotedOutputAtomic: "15000000",
      estimatedGas: "100212",
    },
    {
      id: "aave-v3:usdg",
      kind: "aave-v3-supply",
      adapterId: "aave-v3@1",
      asset: outputAssetV2,
      supplyRateBps: 39,
      tvlUsdE6: "717511731333",
      availableLiquidityAtomic: "528229710420",
      validatedSupplyAtomic: "14925000",
    },
  ],
};

export const routePlanV2: RoutePlanV2 = {
  version: 2,
  inputAsset: inputAssetV2,
  inputAtomic: "25000001",
  retainedAtomic: "10000001",
  horizonDays: 30,
  legs: [
    {
      id: "swap-usdg",
      inputAtomic: "15000000",
      actions: [
        {
          kind: "uniswap-v3-exact-input",
          opportunityId: "uniswap-v3:usdt0-usdg:100:15000000",
          consume: "all",
          tokenIn: inputAssetV2,
          tokenOut: outputAssetV2,
          quotedOutputAtomic: "15000000",
          minimumOutputAtomic: "14925000",
        },
        {
          kind: "aave-v3-supply",
          opportunityId: "aave-v3:usdg",
          consume: "all",
          asset: outputAssetV2,
        },
      ],
    },
  ],
};

export const bundleV2: RouteBundleV2 = {
  version: 2,
  requestId: requestIdV2,
  solverId: "determinist-labs",
  solverAddress: ownerV2,
  policyHash: commitment(policyV2),
  snapshotHash: commitment(snapshotV2),
  routePlan: routePlanV2,
  evidence: [],
  riskFlags: [],
  estimatedPreGasApyBps: 30,
  validUntil: 2_000_000_000,
  signature: signatureV2,
};
