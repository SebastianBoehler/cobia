import type { RouteOpportunityV2, StablecoinPolicyV2 } from "@cobia/domain";
import { isAddressEqual, type Address } from "viem";
import {
  annualizedFullRangeFeeApyBps,
  fullRangeLiquidityForAmounts,
} from "../adapters/uniswap-lp-math";
import type { UniswapFullRangeState } from "../adapters/uniswap-lp-reader";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import { PROTOCOL_REGISTRY, type RegistryAsset } from "../adapters/registry";
import type { BlockReference } from "../adapters/read-client";
import type { UniswapExactInputQuote } from "../adapters/uniswap-reader";

const LOOKBACK_BLOCKS = 86_400n;
const BPS_SCALE = 10_000n;

interface RegisteredAsset {
  key: RegistryAsset;
  address: Address;
  decimals: number;
  priceUsdE8: bigint;
}

export interface FullRangeLpCaptureDependencies {
  getBlock(blockNumber: bigint): Promise<BlockReference>;
  quoteExactInput(input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  }): Promise<UniswapExactInputQuote>;
  readFullRangeState(input: {
    block: BlockReference;
    lookbackBlock: BlockReference;
  }): Promise<UniswapFullRangeState>;
}

function minimumAfterSlippage(value: bigint, slippageBps: number): bigint {
  const numerator = value * BigInt(10_000 - slippageBps);
  const roundedUp = (numerator + BPS_SCALE - 1n) / BPS_SCALE;
  return roundedUp > 0n ? roundedUp : 1n;
}

function poolTvlUsdE6(
  state: UniswapFullRangeState,
  token0: RegisteredAsset,
  token1: RegisteredAsset,
): bigint {
  const token0UsdE8 = state.reserve0Atomic * token0.priceUsdE8 /
    10n ** BigInt(token0.decimals);
  const token1UsdE8 = state.reserve1Atomic * token1.priceUsdE8 /
    10n ** BigInt(token1.decimals);
  return (token0UsdE8 + token1UsdE8) / 100n;
}

export async function captureFullRangeLpOpportunity(input: {
  policy: StablecoinPolicyV2;
  deployedAtomic: bigint;
  inputAsset: RegisteredAsset;
  outputAsset: RegisteredAsset;
  block: BlockReference;
  dependencies: FullRangeLpCaptureDependencies;
  assertContext(value: {
    registryHash: string;
    blockNumber: bigint;
    blockHash: string;
    blockTimestamp: bigint;
  }, block: BlockReference): void;
}): Promise<RouteOpportunityV2 | undefined> {
  const balanceSwapInput = input.deployedAtomic / 2n;
  if (balanceSwapInput <= 0n) return undefined;
  const lookbackNumber = input.block.number - LOOKBACK_BLOCKS;
  if (lookbackNumber <= 0n) return undefined;
  const lookbackBlock = await input.dependencies.getBlock(lookbackNumber);
  const [quote, state] = await Promise.all([
    input.dependencies.quoteExactInput({
      tokenIn: input.inputAsset.key,
      tokenOut: input.outputAsset.key,
      amountInAtomic: balanceSwapInput,
      block: input.block,
    }),
    input.dependencies.readFullRangeState({ block: input.block, lookbackBlock }),
  ]);
  input.assertContext(quote, input.block);
  input.assertContext(state, input.block);
  const registry = PROTOCOL_REGISTRY.uniswapV3;
  if (
    !isAddressEqual(quote.tokenIn, input.inputAsset.address) ||
    !isAddressEqual(quote.tokenOut, input.outputAsset.address) ||
    quote.amountInAtomic !== balanceSwapInput ||
    !isAddressEqual(quote.pool, registry.pair.pool.address) ||
    quote.fee !== registry.pair.fee
  ) {
    throw new Error("Uniswap LP quote does not match the requested balance swap");
  }
  if (
    !isAddressEqual(state.pool, registry.pair.pool.address) ||
    !isAddressEqual(state.positionManager, registry.nonfungiblePositionManager.address) ||
    !isAddressEqual(state.token0, PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token0].underlying.address) ||
    !isAddressEqual(state.token1, PROTOCOL_REGISTRY.aaveV3.assets[registry.pair.token1].underlying.address) ||
    state.fee !== registry.pair.fee
  ) {
    throw new Error("Uniswap LP state does not match the registered deployment");
  }
  const inputRemainder = input.deployedAtomic - balanceSwapInput;
  const inputIsToken0 = isAddressEqual(input.inputAsset.address, state.token0);
  const amount0 = inputIsToken0 ? inputRemainder : quote.amountOutAtomic;
  const amount1 = inputIsToken0 ? quote.amountOutAtomic : inputRemainder;
  const token0 = inputIsToken0 ? input.inputAsset : input.outputAsset;
  const token1 = inputIsToken0 ? input.outputAsset : input.inputAsset;
  const liquidity = fullRangeLiquidityForAmounts({
    sqrtPriceX96: state.sqrtPriceX96,
    amount0Atomic: amount0,
    amount1Atomic: amount1,
  });
  if (liquidity <= 0n) {
    throw new ProtocolIneligibleError(
      "uniswap-zero-liquidity",
      "Uniswap LP amount mints zero liquidity",
    );
  }
  const historicalFeeApyBps = annualizedFullRangeFeeApyBps({
    liquidity,
    sqrtPriceX96: state.sqrtPriceX96,
    feeGrowth0DeltaX128: state.feeGrowth0DeltaX128,
    feeGrowth1DeltaX128: state.feeGrowth1DeltaX128,
    token0Decimals: token0.decimals,
    token1Decimals: token1.decimals,
    token0PriceUsdE8: token0.priceUsdE8,
    token1PriceUsdE8: token1.priceUsdE8,
    lookbackSeconds: state.lookbackSeconds,
  });
  const tvlUsdE6 = poolTvlUsdE6(state, token0, token1);
  return {
    id: `uniswap-v3-lp:${input.inputAsset.address.toLowerCase()}:${input.outputAsset.address.toLowerCase()}:${state.fee}:${input.deployedAtomic}`,
    kind: "uniswap-v3-full-range-lp",
    adapterId: state.adapterId,
    pool: state.pool,
    token0: state.token0,
    token1: state.token1,
    feeTier: state.fee,
    tickLower: state.tickLower,
    tickUpper: state.tickUpper,
    historicalFeeApyBps,
    tvlUsdE6: tvlUsdE6.toString(),
    lookbackSeconds: Number(state.lookbackSeconds),
    validatedInputAsset: input.inputAsset.address,
    validatedInputAtomic: input.deployedAtomic.toString(),
    balanceSwapInputAtomic: balanceSwapInput.toString(),
    quotedSwapOutputAtomic: quote.amountOutAtomic.toString(),
    amount0DesiredAtomic: amount0.toString(),
    amount1DesiredAtomic: amount1.toString(),
    quotedLiquidity: liquidity.toString(),
    minimumLiquidity: minimumAfterSlippage(
      liquidity,
      input.policy.maxSlippageBps,
    ).toString(),
  };
}
