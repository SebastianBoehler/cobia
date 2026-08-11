const Q96 = 2n ** 96n;
const Q128 = 2n ** 128n;
const MIN_SQRT_RATIO = 4_295_128_739n;
const MAX_SQRT_RATIO = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const YEAR_SECONDS = 365n * 86_400n;

function assertPrice(sqrtPriceX96: bigint): void {
  if (sqrtPriceX96 <= MIN_SQRT_RATIO || sqrtPriceX96 >= MAX_SQRT_RATIO) {
    throw new Error("Uniswap sqrt price is outside the full-range bounds");
  }
}

function amount0Liquidity(amount: bigint, sqrtPriceX96: bigint): bigint {
  const intermediate = sqrtPriceX96 * MAX_SQRT_RATIO / Q96;
  return amount * intermediate / (MAX_SQRT_RATIO - sqrtPriceX96);
}

function amount1Liquidity(amount: bigint, sqrtPriceX96: bigint): bigint {
  return amount * Q96 / (sqrtPriceX96 - MIN_SQRT_RATIO);
}

export function fullRangeLiquidityForAmounts(input: {
  sqrtPriceX96: bigint;
  amount0Atomic: bigint;
  amount1Atomic: bigint;
}): bigint {
  assertPrice(input.sqrtPriceX96);
  if (input.amount0Atomic <= 0n || input.amount1Atomic <= 0n) {
    throw new Error("Full-range LP amounts must be positive");
  }
  const liquidity0 = amount0Liquidity(input.amount0Atomic, input.sqrtPriceX96);
  const liquidity1 = amount1Liquidity(input.amount1Atomic, input.sqrtPriceX96);
  return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
}

export function fullRangeAmountsForLiquidity(input: {
  sqrtPriceX96: bigint;
  liquidity: bigint;
}): { amount0Atomic: bigint; amount1Atomic: bigint } {
  assertPrice(input.sqrtPriceX96);
  if (input.liquidity <= 0n) throw new Error("Full-range liquidity must be positive");
  return {
    amount0Atomic: ((input.liquidity << 96n) *
      (MAX_SQRT_RATIO - input.sqrtPriceX96) / MAX_SQRT_RATIO) /
      input.sqrtPriceX96,
    amount1Atomic: input.liquidity *
      (input.sqrtPriceX96 - MIN_SQRT_RATIO) / Q96,
  };
}

function usdE8(amount: bigint, decimals: number, priceUsdE8: bigint): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || priceUsdE8 < 0n) {
    throw new Error("LP valuation input is malformed");
  }
  return amount * priceUsdE8 / (10n ** BigInt(decimals));
}

export function annualizedFullRangeFeeApyBps(input: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  feeGrowth0DeltaX128: bigint;
  feeGrowth1DeltaX128: bigint;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsdE8: bigint;
  token1PriceUsdE8: bigint;
  lookbackSeconds: bigint;
}): number {
  if (input.liquidity <= 0n || input.lookbackSeconds <= 0n) {
    throw new Error("LP liquidity and lookback must be positive");
  }
  const amounts = fullRangeAmountsForLiquidity(input);
  const positionValue = usdE8(
    amounts.amount0Atomic,
    input.token0Decimals,
    input.token0PriceUsdE8,
  ) + usdE8(
    amounts.amount1Atomic,
    input.token1Decimals,
    input.token1PriceUsdE8,
  );
  if (positionValue <= 0n) throw new Error("LP USD value must be positive");
  const fees0 = input.liquidity * input.feeGrowth0DeltaX128 / Q128;
  const fees1 = input.liquidity * input.feeGrowth1DeltaX128 / Q128;
  const feeValue = usdE8(fees0, input.token0Decimals, input.token0PriceUsdE8) +
    usdE8(fees1, input.token1Decimals, input.token1PriceUsdE8);
  const annualized = feeValue * 10_000n * YEAR_SECONDS /
    (positionValue * input.lookbackSeconds);
  if (annualized > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Historical LP fee APY exceeds the safe integer range");
  }
  return Number(annualized);
}
