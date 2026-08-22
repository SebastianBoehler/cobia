import { decimalToAtomic } from "./capability-templates";

const MARKET_FLOOR_BPS = 9_900n;

function decimalRatio(value: string): { coefficient: bigint; scale: bigint } | undefined {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > 48) return undefined;
  const fraction = match[2] ?? "";
  const coefficient = BigInt(`${match[1]}${fraction}`);
  return coefficient > 0n ? { coefficient, scale: 10n ** BigInt(fraction.length) } : undefined;
}

export function formatAtomicAmount(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function deriveMarketMinimum(input: {
  amount: string;
  inputDecimals: number;
  inputPriceUsd: string;
  outputDecimals: number;
  outputPriceUsd: string;
}): string | undefined {
  const amount = decimalToAtomic(input.amount, input.inputDecimals);
  const inputPrice = decimalRatio(input.inputPriceUsd);
  const outputPrice = decimalRatio(input.outputPriceUsd);
  if (!amount || !inputPrice || !outputPrice) return undefined;
  const numerator = BigInt(amount) * inputPrice.coefficient * outputPrice.scale *
    10n ** BigInt(input.outputDecimals) * MARKET_FLOOR_BPS;
  const denominator = 10n ** BigInt(input.inputDecimals) * inputPrice.scale *
    outputPrice.coefficient * 10_000n;
  const minimum = numerator / denominator;
  return minimum > 0n ? formatAtomicAmount(minimum, input.outputDecimals) : undefined;
}
