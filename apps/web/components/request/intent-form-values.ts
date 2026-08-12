import type { RouteObjectiveV2 } from "@cobia/domain";
import type { Address } from "viem";
import type { IntentMode } from "../intents/IntentModeTabs";

const BPS = 10_000n;

export function decimalToAtomic(value: string, decimals: number): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  const result = whole * 10n ** BigInt(decimals) + BigInt(fraction || "0");
  return result > 0n ? result.toString() : null;
}

export function percentToBps(value: string): number | null {
  const atomic = decimalToAtomic(value, 2);
  if (!atomic) return null;
  const bps = Number(atomic);
  return Number.isSafeInteger(bps) && bps <= 10_000 ? bps : null;
}

export function formatPrincipal(atomic: string | null, symbol: string): string {
  if (!atomic) return "—";
  return `${(Number(atomic) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

export function intentOutcome(
  mode: IntentMode,
  amount: string,
  asset: string,
  output: string,
): string {
  const displayAmount = amount || "—";
  if (mode === "Earn") {
    return `Earn the best verified return on ${displayAmount} ${asset} within your bounds.`;
  }
  return mode === "Swap"
    ? `Swap ${displayAmount} ${asset} for the most ${output} available within your slippage bound.`
    : `Find a verified round-trip route for ${displayAmount} ${asset} that ends with more ${asset} after fees and gas.`;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function objectiveForMode(input: {
  mode: IntentMode;
  principalAtomic: string;
  outputAsset: Address;
  maxSlippageBps: number;
  minimumProfitBps: number;
}): RouteObjectiveV2 | undefined {
  if (input.mode === "Earn") return undefined;
  const principal = BigInt(input.principalAtomic);
  if (input.mode === "Swap") {
    return {
      kind: "swap",
      outputAsset: input.outputAsset.toLowerCase() as Address,
      minimumOutputAtomic: ceilDiv(
        principal * BigInt(10_000 - input.maxSlippageBps),
        BPS,
      ).toString(),
    };
  }
  return {
    kind: "profit",
    minimumFinalAtomic: ceilDiv(
      principal * BigInt(10_000 + input.minimumProfitBps),
      BPS,
    ).toString(),
  };
}
