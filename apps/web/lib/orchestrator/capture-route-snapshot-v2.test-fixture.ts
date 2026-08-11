import type { StablecoinPolicyV2 } from "@cobia/domain";
import { vi } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";

export const block = {
  number: 67_649_362n,
  hash: "0x389aab5c989acb3e633dbf96f8fab038757bee9919142ba983d4bd195eb64b5a",
  timestamp: 1_786_418_398n,
} as const;
export const lookbackBlock = {
  number: block.number - 86_400n,
  hash: `0x${"12".repeat(32)}` as const,
  timestamp: block.timestamp - 86_400n,
};
export const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
export const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address;

export const policy: StablecoinPolicyV2 = {
  version: 2,
  requestId: "550e8400-e29b-41d4-a716-446655440002",
  owner: "0x1111111111111111111111111111111111111111",
  executionChainId: 196,
  asset: usdt0.toLowerCase() as typeof usdt0,
  principalAtomic: "100000000",
  protocolExposureBps: 5_000,
  minTvlUsdE6: "1000000",
  minPreGasApyBps: 20,
  maxSnapshotAgeSec: 300,
  deadline: 2_000_000_000,
  noBridges: true,
  allowedOutputAssets: [usdg.toLowerCase(), usdt0.toLowerCase()] as [typeof usdg, typeof usdt0],
  allowedAdapters: ["aave-v3@1", "uniswap-v3@1"],
  maxSlippageBps: 100,
  horizonDays: 30,
};

export function reserve(
  asset: typeof usdg | typeof usdt0,
  rateRay: bigint,
  amount: bigint,
) {
  const registered = asset.toLowerCase() === usdg.toLowerCase()
    ? PROTOCOL_REGISTRY.aaveV3.assets.USDG
    : PROTOCOL_REGISTRY.aaveV3.assets.USDt0;
  return {
    adapterId: "aave-v3@1" as const,
    registryHash,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    asset,
    aToken: registered.aToken.address,
    decimals: 6,
    ltvBps: 7_500n,
    liquidationThresholdBps: 7_800n,
    liquidationBonusBps: 10_500n,
    reserveFactorBps: 1_000n,
    collateralEnabled: true,
    borrowingEnabled: true,
    borrowCapWholeTokens: 0n,
    supplyCapWholeTokens: 100_000_000n,
    supplyHeadroomAtomic: 50_000_000_000_000n,
    totalATokenAtomic: asset.toLowerCase() === usdg.toLowerCase()
      ? 700_000_000_000n : 52_000_000_000_000n,
    scaledTotalSupply: 51_900_000_000_000n,
    scaledSupplyAmount: amount,
    capUsageAfterAtomic: 52_100_000_000_000n,
    accruedToTreasuryScaled: 1_000n,
    pendingTreasuryAtomic: 1_001n,
    nextLiquidityIndexRay: 10n ** 27n,
    availableLiquidityAtomic: 40_000_000_000_000n,
    validatedSupplyAtomic: amount,
    totalStableDebtAtomic: 0n,
    totalVariableDebtAtomic: 1_000_000n,
    liquidityRateRay: rateRay,
  };
}

export function uniswapQuote(amountInAtomic: bigint = 50_000_000n) {
  return {
    adapterId: "uniswap-v3@1" as const,
    registryHash,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    tokenIn: usdt0,
    tokenOut: usdg,
    pool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address,
    fee: 100 as const,
    liquidity: 1_000_000n,
    amountInAtomic,
    amountOutAtomic: amountInAtomic === 25_000_000n
      ? 24_950_000n
      : 49_900_000n,
    sqrtPriceX96After: 2n ** 96n,
    initializedTicksCrossed: 0,
    gasEstimate: 100_212n,
  };
}

export function dependencies() {
  return {
    getLatestBlock: vi.fn().mockResolvedValue(block),
    getBlock: vi.fn().mockImplementation(async (blockNumber: bigint) => {
      if (blockNumber !== lookbackBlock.number) throw new Error("unexpected lookback block");
      return lookbackBlock;
    }),
    readOraclePrices: vi.fn().mockResolvedValue({
      adapterId: "aave-v3@1" as const,
      registryHash,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      oracle: PROTOCOL_REGISTRY.aaveV3.oracle.address,
      baseCurrencyUnit: 100_000_000n as const,
      prices: [
        { asset: usdg, decimals: 6 as const, priceUsdE8: 99_999_018n },
        { asset: usdt0, decimals: 6 as const, priceUsdE8: 99_912_234n },
      ],
    }),
    readReserve: vi.fn().mockImplementation(async (
      input: { asset: "USDG" | "USDt0"; amountAtomic: bigint },
    ) => input.asset === "USDG"
      ? reserve(usdg, 40n * 10n ** 23n, input.amountAtomic)
      : reserve(usdt0, 24n * 10n ** 23n, input.amountAtomic)),
    quoteExactInput: vi.fn().mockImplementation(async (
      input: { amountInAtomic: bigint },
    ) => uniswapQuote(input.amountInAtomic)),
    readFullRangeState: vi.fn().mockResolvedValue({
      adapterId: "uniswap-v3@1" as const,
      registryHash,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      pool: PROTOCOL_REGISTRY.uniswapV3.pair.pool.address,
      positionManager: PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address,
      token0: usdg,
      token1: usdt0,
      fee: 100 as const,
      tickSpacing: 1,
      tickLower: -887272,
      tickUpper: 887272,
      sqrtPriceX96: 2n ** 96n,
      tick: 0,
      liquidity: 1_000_000n,
      reserve0Atomic: 1_000_000_000n,
      reserve1Atomic: 1_000_000_000n,
      feeGrowth0DeltaX128: (2n ** 128n) / 10_000n,
      feeGrowth1DeltaX128: (2n ** 128n) / 20_000n,
      lookbackSeconds: 86_400n,
    }),
  };
}
