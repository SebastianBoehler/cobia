import { SUPPORTED_ASSETS } from "../chain/supported-assets";

export type CapabilityTemplateId = "aave-supply" | "exact-input-swap" | "round-trip";

export const CAPABILITY_TEMPLATES = [
  { id: "aave-supply", label: "Supply to Aave V3", description: "One bounded supply action and a minimum receipt-token increase." },
  { id: "exact-input-swap", label: "Exchange an exact input", description: "Curve or Uniswap V3 with an explicit minimum output." },
  { id: "round-trip", label: "Atomic round trip", description: "At most two exchange actions ending with more of the starting asset." },
] as const;

export const INTENT_ASSETS = SUPPORTED_ASSETS.map(({ address, displaySymbol, decimals }) => ({
  address, symbol: displaySymbol, decimals,
}));

export function decimalToAtomic(value: string, decimals: number): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  const atomic = BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? "").padEnd(decimals, "0") || "0");
  return atomic > 0n ? atomic.toString() : null;
}

export function atomicLabel(value: string, symbol: string, decimals = 6): string {
  const atomic = decimalToAtomic(value, decimals);
  return atomic ? `${value} ${symbol}` : "Complete this field";
}
