export const REVEAL_FEE_USD_E8 = 10_000_000n;

export interface HorizonRouteEconomics {
  principalUsdE8: bigint;
  estimatedGrossYieldUsdE8: bigint;
  revealFeeUsdE8: bigint;
  netBeforeGasUsdE8: bigint;
  breakEvenPrincipalUsdE8: bigint | null;
  status: "not-economical" | "positive-before-gas";
}

function divideCeil(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function projectRouteEconomicsForHorizon(input: {
  principalAtomic: string;
  decimals: number;
  priceUsdE8: string;
  estimatedPreGasApyBps: number;
  horizonDays: number;
  revealFeeUsdE8?: bigint;
}): HorizonRouteEconomics {
  const principalAtomic = BigInt(input.principalAtomic);
  const priceUsdE8 = BigInt(input.priceUsdE8);
  const revealFeeUsdE8 = input.revealFeeUsdE8 ?? REVEAL_FEE_USD_E8;
  if (principalAtomic <= 0n || input.decimals < 0 || input.decimals > 255 ||
    priceUsdE8 <= 0n || !Number.isSafeInteger(input.estimatedPreGasApyBps) ||
    input.estimatedPreGasApyBps < 0 || !Number.isSafeInteger(input.horizonDays) ||
    input.horizonDays <= 0 || revealFeeUsdE8 < 0n) {
    throw new Error("Route economics input is invalid");
  }
  const principalUsdE8 = principalAtomic * priceUsdE8 / 10n ** BigInt(input.decimals);
  const yieldNumerator = BigInt(input.estimatedPreGasApyBps * input.horizonDays);
  const yieldDenominator = 10_000n * 365n;
  const estimatedGrossYieldUsdE8 = principalUsdE8 * yieldNumerator / yieldDenominator;
  const netBeforeGasUsdE8 = estimatedGrossYieldUsdE8 - revealFeeUsdE8;
  return {
    principalUsdE8,
    estimatedGrossYieldUsdE8,
    revealFeeUsdE8,
    netBeforeGasUsdE8,
    breakEvenPrincipalUsdE8: yieldNumerator === 0n
      ? null
      : divideCeil(revealFeeUsdE8 * yieldDenominator, yieldNumerator),
    status: netBeforeGasUsdE8 > 0n ? "positive-before-gas" : "not-economical",
  };
}

export function formatUsdE8(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const fractionDigits = absolute < 1_000_000n ? 4 : 2;
  const fractionScale = 10n ** BigInt(fractionDigits);
  const sourceScale = 100_000_000n / fractionScale;
  const rounded = (absolute + sourceScale / 2n) / sourceScale;
  const whole = rounded / fractionScale;
  const fraction = (rounded % fractionScale).toString().padStart(fractionDigits, "0");
  const formatted = `${whole.toLocaleString("en-US")}.${fraction}`;
  return `${negative ? "−" : ""}$${formatted}`;
}
