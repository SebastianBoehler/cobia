import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import type { Address } from "viem";
import { INTENT_ASSETS, decimalToAtomic } from "./capability-templates";
import {
  applyWalletBalanceShare, walletBalanceShare, type WalletBalances,
} from "./wallet-balance-request";

export interface StagedConversionInputDraft {
  kind: "native" | "erc20";
  chainId: 196;
  token: Address;
  symbol: string;
  decimals: number;
  amount: string;
}

export interface StagedConversionDraft {
  kind: "staged-conversion";
  templateId: "staged-conversion";
  inputs: StagedConversionInputDraft[];
  outputToken: Address;
  outputSymbol: string;
  outputDecimals: number;
  minimum: string;
  minimumSource?: "market-default";
  maxSolverFeeUsd: string;
}

export interface StagedConversionClarification {
  kind: "clarification";
  question: string;
}

const MARKET_FLOOR_BPS = 9_900n;
const PRICE_DECIMALS = 18;

function atomic(value: string, decimals: number): bigint | undefined {
  const parsed = decimalToAtomic(value, decimals);
  return parsed ? BigInt(parsed) : undefined;
}

function formatAtomic(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function input(symbol: string, amount: string): StagedConversionInputDraft | undefined {
  if (symbol === "OKB") return atomic(amount, 18) ? {
    kind: "native", chainId: 196, token: NATIVE_ASSET_ADDRESS,
    symbol, decimals: 18, amount,
  } : undefined;
  const asset = INTENT_ASSETS.find((item) => item.symbol === symbol);
  return asset && atomic(amount, asset.decimals) ? {
    kind: "erc20", chainId: 196, token: asset.address,
    symbol: asset.symbol, decimals: asset.decimals, amount,
  } : undefined;
}

function decimals(symbol: string): number | undefined {
  return symbol === "OKB" ? 18 : INTENT_ASSETS.find((item) => item.symbol === symbol)?.decimals;
}

function normalizedSymbol(value: string): string {
  return value.toUpperCase() === "USDT0" ? "USDt0" : value.toUpperCase();
}

function resolveInputPart(part: string, balances: WalletBalances):
  StagedConversionInputDraft | StagedConversionClarification | undefined {
  const exact = part.trim().match(/^(\d+(?:\.\d+)?)\s+@?(OKB|USDG|USDt0)$/i);
  if (exact) return input(normalizedSymbol(exact[2]!), exact[1]!);
  const relative = part.trim().match(/\b@?(OKB|USDG|USDt0)(?:\s+(?:wallet\s+)?balance)?$/i);
  if (!relative) return undefined;
  const symbol = normalizedSymbol(relative[1]!);
  const share = walletBalanceShare(part, symbol);
  if (!share) return undefined;
  if (share.kind === "ambiguous") return { kind: "clarification",
    question: `What percentage of your ${symbol} balance should be used?` };
  const assetDecimals = decimals(symbol);
  const balance = assetDecimals === undefined ? undefined
    : decimalToAtomic(balances[symbol] ?? "", assetDecimals);
  const amount = balance && assetDecimals !== undefined
    ? applyWalletBalanceShare(BigInt(balance), assetDecimals, share) : undefined;
  return amount ? input(symbol, amount) : { kind: "clarification",
    question: `Your ${symbol} wallet balance is zero. Fund it or enter an exact amount.` };
}

export function resolveStagedConversionGoal(
  goal: string,
  prices: Readonly<Record<string, string>> = {},
  balances: WalletBalances = {},
): StagedConversionDraft | StagedConversionClarification | undefined {
  const match = goal.trim().match(/^(?:turn|convert|swap)\s+(.+?)\s+(?:in)?to\s+(USDG|USDt0)$/i);
  if (!match) return undefined;
  const output = INTENT_ASSETS.find(({ symbol }) =>
    symbol.toLowerCase() === match[2]!.toLowerCase());
  const parts = match[1]!.split(/\s+and\s+/i);
  const parsedInputs = parts.map((part) => resolveInputPart(part, balances));
  const clarification = parsedInputs.find((value) => value?.kind === "clarification");
  if (clarification?.kind === "clarification") return clarification;
  if (!output || !parsedInputs.length || parsedInputs.some((value) => !value) ||
      !parsedInputs.some((value) => value?.kind === "native")) return undefined;
  const inputs = parsedInputs as StagedConversionInputDraft[];
  if (new Set(inputs.map(({ token }) => token.toLowerCase())).size !== inputs.length ||
      inputs.some(({ token }) => token.toLowerCase() === output.address.toLowerCase())) return undefined;
  const outputPrice = atomic(prices[output.symbol] ?? "", PRICE_DECIMALS);
  const inputValues = inputs.map((item) => {
    const price = atomic(prices[item.symbol] ?? "", PRICE_DECIMALS);
    const amount = atomic(item.amount, item.decimals);
    return price && amount ? amount * price / 10n ** BigInt(item.decimals) : undefined;
  });
  if (!outputPrice || inputValues.some((value) => value === undefined)) return undefined;
  const totalUsd = (inputValues as bigint[]).reduce((sum, value) => sum + value, 0n);
  const minimumAtomic = totalUsd * MARKET_FLOOR_BPS * 10n ** BigInt(output.decimals) /
    (10_000n * outputPrice);
  if (minimumAtomic <= 0n) return undefined;
  return {
    kind: "staged-conversion", templateId: "staged-conversion", inputs,
    outputToken: output.address, outputSymbol: output.symbol, outputDecimals: output.decimals,
    minimum: formatAtomic(minimumAtomic, output.decimals), minimumSource: "market-default",
    maxSolverFeeUsd: "0",
  };
}
