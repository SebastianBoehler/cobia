import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
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
  minimumSource?: "stablecoin-default" | "market-default" | "round-trip-default";
  maxSolverFeeUsd: string;
  jurisdiction: string;
  eligibilityAccepted: boolean;
}

export const STABLECOIN_DEFAULT_FLOOR_BPS = 9_900n;

function formatAtomic(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function stablecoinDefaultMinimum(
  input: { symbol: string; decimals: number },
  output: { symbol: string; decimals: number },
  amount: string,
): string | null {
  const supportedPair = (input.symbol === "USDG" && output.symbol === "USDt0") ||
    (input.symbol === "USDt0" && output.symbol === "USDG");
  const inputAtomic = decimalToAtomic(amount, input.decimals);
  if (!supportedPair || !inputAtomic || input.decimals !== output.decimals) return null;
  const minimumAtomic = BigInt(inputAtomic) * STABLECOIN_DEFAULT_FLOOR_BPS / 10_000n;
  return minimumAtomic > 0n ? formatAtomic(minimumAtomic, output.decimals) : null;
}

export const CAPABILITY_TEMPLATES = [
  { id: "aave-supply", label: "Supply to Aave V3", description: "One bounded supply action and a minimum receipt-token increase." },
  { id: "exact-input-swap", label: "Exchange an exact input", description: "Curve or Uniswap V3 with an explicit minimum output." },
  { id: "round-trip", label: "Atomic round trip", description: "At most two exchange actions ending with more of the starting asset." },
  { id: "rwa-acquisition", label: "Acquire a cross-chain asset", description: "An open solver intent with exact source and destination balance limits." },
] as const;

export const INTENT_ASSETS = SUPPORTED_ASSETS.map(({ address, displaySymbol, decimals }) => ({
  address, symbol: displaySymbol, decimals,
}));

export const NATIVE_INTENT_ASSET = {
  address: NATIVE_ASSET_ADDRESS, symbol: "OKB", decimals: 18,
} as const;

export const CONVERSION_INTENT_ASSETS = [NATIVE_INTENT_ASSET, ...INTENT_ASSETS] as const;

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

export function rwaInputAsset(instrument: (typeof RWA_INTENT_ASSETS)[number]["instrument"]) {
  if (instrument.chainId === 1) return ETHEREUM_USDC;
  const asset = INTENT_ASSETS.find(({ symbol }) => symbol === "USDG");
  if (!asset) throw new Error("X Layer USDG is unavailable");
  return asset;
}

export const DEFAULT_INTENT_RECEIPT_VALUES: IntentReceiptValues = {
  templateId: "aave-supply",
  inputToken: INTENT_ASSETS[0].address,
  outputToken: INTENT_ASSETS[1].address,
  amount: "10",
  minimum: "9.95",
  maxSolverFeeUsd: "0",
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
