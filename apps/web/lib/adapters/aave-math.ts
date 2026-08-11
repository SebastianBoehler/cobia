const RAY = 10n ** 27n;
const HALF_RAY = RAY / 2n;
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

function rayMul(left: bigint, right: bigint): bigint {
  return (left * right + HALF_RAY) / RAY;
}

export function rayMulFloor(left: bigint, right: bigint): bigint {
  return left * right / RAY;
}

export function rayDivFloor(left: bigint, right: bigint): bigint {
  if (right <= 0n) throw new Error("Aave ray divisor must be positive");
  return left * RAY / right;
}

// Mirrors Aave MathUtils.calculateLinearInterest and WadRayMath.rayMul.
// https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/math/MathUtils.sol
export function calculatePendingTreasury(input: {
  accruedToTreasuryScaled: bigint;
  liquidityRateRay: bigint;
  currentLiquidityIndexRay: bigint;
  lastUpdateTimestamp: bigint;
  blockTimestamp: bigint;
}) {
  if (input.blockTimestamp < input.lastUpdateTimestamp) {
    throw new Error("Aave reserve timestamp is after the pinned block timestamp");
  }
  const elapsed = input.blockTimestamp - input.lastUpdateTimestamp;
  const linearInterestRay = RAY + input.liquidityRateRay * elapsed / SECONDS_PER_YEAR;
  const nextLiquidityIndexRay = rayMul(
    linearInterestRay,
    input.currentLiquidityIndexRay,
  );
  return {
    nextLiquidityIndexRay,
    pendingTreasuryAtomic: rayMulFloor(
      input.accruedToTreasuryScaled,
      nextLiquidityIndexRay,
    ),
  };
}
