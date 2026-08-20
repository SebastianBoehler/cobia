import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import type { Address } from "viem";
import { productionInstrumentRegistryV1 } from "../instruments/production-registry";

export type CapabilityTemplateId = "aave-supply" | "exact-input-swap" | "round-trip" |
  "rwa-acquisition";

export interface IntentReceiptValues {
  templateId: CapabilityTemplateId;
  inputToken: Address;
  amount: string;
  outputToken: Address;
  minimum: string;
  maxSolverFeeUsd: string;
  jurisdiction: string;
  eligibilityAccepted: boolean;
}

export const CAPABILITY_TEMPLATES = [
  { id: "aave-supply", label: "Supply to Aave V3", description: "One bounded supply action and a minimum receipt-token increase." },
  { id: "exact-input-swap", label: "Exchange an exact input", description: "Curve or Uniswap V3 with an explicit minimum output." },
  { id: "round-trip", label: "Atomic round trip", description: "At most two exchange actions ending with more of the starting asset." },
  { id: "rwa-acquisition", label: "Acquire a registered RWA", description: "A fresh exact-call route to an issuer-registered token with explicit eligibility evidence." },
] as const;

export const INTENT_ASSETS = SUPPORTED_ASSETS.map(({ address, displaySymbol, decimals }) => ({
  address, symbol: displaySymbol, decimals,
}));

export const ETHEREUM_USDC = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address,
  symbol: "USDC", decimals: 6,
};

export const RWA_INTENT_ASSETS = productionInstrumentRegistryV1().map((instrument) => ({
  address: instrument.token as Address,
  symbol: instrument.symbol,
  decimals: 18,
  instrument,
}));

export const DEFAULT_INTENT_RECEIPT_VALUES: IntentReceiptValues = {
  templateId: "aave-supply",
  inputToken: INTENT_ASSETS[0].address,
  outputToken: INTENT_ASSETS[1].address,
  amount: "10",
  minimum: "9.95",
  maxSolverFeeUsd: "0.10",
  jurisdiction: "DE",
  eligibilityAccepted: false,
};

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
