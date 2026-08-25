import type { Address } from "viem";
import { z } from "zod";
import {
  CONVERSION_INTENT_ASSETS, decimalToAtomic, INTENT_ASSETS, NATIVE_INTENT_ASSET,
  stablecoinDefaultMinimum, type IntentReceiptValues,
} from "./capability-templates";
import type { WalletBalances } from "./wallet-balance-request";
import { requestedInputAmount } from "./deterministic-intent-draft";
import {
  deriveMarketInputForMinimum, deriveMarketMinimum, formatAtomicAmount,
} from "./market-minimum";

export interface StagedConversionInputDraft {
  kind: "native" | "erc20";
  chainId: 196;
  token: Address;
  symbol: string;
  decimals: number;
  amount: string;
}

export interface WalletIntentAsset {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface StagedConversionDraft {
  kind: "staged-conversion";
  templateId: "staged-conversion";
  inputs: StagedConversionInputDraft[];
  outputToken: Address;
  outputSymbol: string;
  outputDecimals: number;
  minimumStages?: number;
  minimum: string;
  minimumSource?: "market-default";
  maxSolverFeeUsd: string;
}

const ExactConversionInputSchema = z.object({
  symbol: z.string().min(1),
  amount: z.string().min(1),
  walletShareBps: z.null(),
}).strict();

const WalletShareConversionInputSchema = z.object({
  symbol: z.string().min(1),
  amount: z.literal(""),
  walletShareBps: z.number().int().min(1).max(10_000),
}).strict();

export const ConversionModelDraftSchema = z.object({
  inputs: z.array(z.union([
    ExactConversionInputSchema, WalletShareConversionInputSchema,
  ])).min(1).max(8),
  outputSymbol: z.string().min(1),
  minimumOutput: z.string(),
  minimumStages: z.number().int().min(1).max(8),
}).strict();

export type ConversionModelDraft = z.infer<typeof ConversionModelDraftSchema>;

type ConversionResolution = IntentReceiptValues | StagedConversionDraft |
  { kind: "clarification"; question: string };

function atomic(value: string, decimals: number): bigint | undefined {
  const parsed = decimalToAtomic(value, decimals);
  return parsed ? BigInt(parsed) : undefined;
}

function canonicalBalance(symbol: string, balances: WalletBalances): string | undefined {
  const entry = Object.entries(balances).find(([candidate]) =>
    candidate.toLowerCase() === symbol.toLowerCase());
  return entry?.[1];
}

function walletAsset(symbol: string, assets: readonly WalletIntentAsset[]): WalletIntentAsset | undefined {
  return assets.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
}

function explicitGoalAmount(goal: string, symbol: string, decimals: number): string | undefined {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const amount = goal.match(new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*@?${escaped}(?=$|[^A-Za-z0-9])`, "i",
  ))?.[1];
  return amount && decimalToAtomic(amount, decimals) ? amount : undefined;
}

export function bindOutputTargetInput(
  goal: string,
  draft: ConversionModelDraft,
  prices: Readonly<Record<string, string>> = {},
  balances: WalletBalances = {},
  walletAssets: readonly WalletIntentAsset[] = INTENT_ASSETS,
): ConversionModelDraft | { question: string } {
  if (draft.inputs.length !== 1 || !draft.minimumOutput) return draft;
  const output = CONVERSION_INTENT_ASSETS.find(({ symbol }) =>
    symbol.toLowerCase() === draft.outputSymbol.toLowerCase());
  const requestedOutput = output && explicitGoalAmount(goal, output.symbol, output.decimals);
  if (!output || !requestedOutput ||
      decimalToAtomic(requestedOutput, output.decimals) !==
      decimalToAtomic(draft.minimumOutput, output.decimals)) return draft;
  const requested = draft.inputs[0]!;
  const input = requested.symbol.toLowerCase() === NATIVE_INTENT_ASSET.symbol.toLowerCase()
    ? NATIVE_INTENT_ASSET : walletAsset(requested.symbol, walletAssets);
  if (!input || requestedInputAmount({ goal, symbol: input.symbol,
    decimals: input.decimals, balances })) return draft;
  const amount = deriveMarketInputForMinimum({ minimumOutput: requestedOutput,
    inputDecimals: input.decimals, inputPriceUsd: prices[input.symbol] ?? "",
    outputDecimals: output.decimals, outputPriceUsd: prices[output.symbol] ?? "" });
  if (!amount) return { question: "A fresh price is unavailable for the requested output target." };
  const available = canonicalBalance(input.symbol, balances);
  if (available && BigInt(decimalToAtomic(amount, input.decimals)!) >
      BigInt(decimalToAtomic(available, input.decimals) ?? "0")) return {
    question: `Your ${input.symbol} wallet balance cannot cover the requested ${requestedOutput} ${output.symbol}.`,
  };
  return { ...draft, inputs: [{ symbol: requested.symbol, amount, walletShareBps: null }] };
}

function resolveAmount(
  input: ConversionModelDraft["inputs"][number],
  symbol: string,
  decimals: number,
  balances: WalletBalances,
): string | { question: string } {
  if (input.amount && input.walletShareBps !== null) {
    return { question: `Specify either an exact ${symbol} amount or a wallet share, not both.` };
  }
  const available = canonicalBalance(symbol, balances);
  const availableAtomic = available && atomic(available, decimals);
  if (input.walletShareBps !== null) {
    if (!availableAtomic) return { question: `Your ${symbol} wallet balance is zero. Fund it or enter an exact amount.` };
    const amountAtomic = availableAtomic * BigInt(input.walletShareBps) / 10_000n;
    return amountAtomic > 0n ? formatAtomicAmount(amountAtomic, decimals)
      : { question: `The requested ${symbol} wallet share rounds to zero.` };
  }
  const requestedAtomic = atomic(input.amount, decimals);
  if (!requestedAtomic) return { question: `Enter a valid ${symbol} amount.` };
  return input.amount;
}

function simpleSwap(
  input: StagedConversionInputDraft,
  output: (typeof CONVERSION_INTENT_ASSETS)[number],
  minimumOutput: string,
): IntentReceiptValues | undefined {
  const registeredInput = INTENT_ASSETS.find(({ address }) =>
    address.toLowerCase() === input.token.toLowerCase());
  const minimum = minimumOutput || (registeredInput &&
    stablecoinDefaultMinimum(registeredInput, output, input.amount));
  return registeredInput && minimum ? {
    templateId: "exact-input-swap",
    inputToken: registeredInput.address,
    outputToken: output.address,
    amount: input.amount,
    minimum,
    minimumSource: minimumOutput ? undefined : "stablecoin-default",
    maxSolverFeeUsd: "0",
    jurisdiction: "",
    eligibilityAccepted: false,
  } : undefined;
}

export function resolveConversionDraft(
  value: unknown,
  prices: Readonly<Record<string, string>> = {},
  balances: WalletBalances = {},
  walletAssets: readonly WalletIntentAsset[] = INTENT_ASSETS,
): ConversionResolution {
  const draft = ConversionModelDraftSchema.parse(value);
  const output = CONVERSION_INTENT_ASSETS.find(({ symbol }) =>
    symbol.toLowerCase() === draft.outputSymbol.toLowerCase());
  if (!output) return { kind: "clarification", question: "Choose a registered conversion output asset." };

  const inputs: StagedConversionInputDraft[] = [];
  for (const requested of draft.inputs) {
    const isNative = requested.symbol.toLowerCase() === "okb";
    const asset = isNative ? NATIVE_INTENT_ASSET
      : walletAsset(requested.symbol, walletAssets);
    if (!asset) return { kind: "clarification",
      question: `${requested.symbol} is not available in the connected wallet.` };
    const amount = resolveAmount(requested, asset.symbol, asset.decimals, balances);
    if (typeof amount !== "string") return { kind: "clarification", question: amount.question };
    inputs.push({ kind: isNative ? "native" : "erc20", chainId: 196,
      token: asset.address, symbol: asset.symbol, decimals: asset.decimals, amount });
  }

  if (new Set(inputs.map(({ token }) => token.toLowerCase())).size !== inputs.length) {
    return { kind: "clarification", question: "Each conversion input asset may appear only once." };
  }
  if (inputs.some(({ token }) => token.toLowerCase() === output.address.toLowerCase())) {
    return { kind: "clarification", question: `${output.symbol} cannot be both an input and the output.` };
  }
  if (draft.minimumOutput && !atomic(draft.minimumOutput, output.decimals)) {
    return { kind: "clarification", question: `Enter a valid ${output.symbol} outcome amount.` };
  }
  if (inputs.length === 1 && draft.minimumStages === 1) {
    const simple = simpleSwap(inputs[0]!, output, draft.minimumOutput);
    if (simple) return simple;
  }

  if (draft.minimumOutput) return {
    kind: "staged-conversion", templateId: "staged-conversion", inputs,
    outputToken: output.address, outputSymbol: output.symbol, outputDecimals: output.decimals,
    ...(draft.minimumStages > inputs.length ? { minimumStages: draft.minimumStages } : {}),
    minimum: draft.minimumOutput, maxSolverFeeUsd: "0",
  };

  const minimums = inputs.map((item) => deriveMarketMinimum({
    amount: item.amount, inputDecimals: item.decimals,
    inputPriceUsd: prices[item.symbol] ?? "", outputDecimals: output.decimals,
    outputPriceUsd: prices[output.symbol] ?? "",
  }));
  if (minimums.some((value) => value === undefined)) return {
    kind: "clarification", question: "A fresh price is unavailable for one of the requested assets.",
  };
  const minimumAtomic = (minimums as string[]).reduce((sum, value) =>
    sum + BigInt(decimalToAtomic(value, output.decimals)!), 0n);
  if (minimumAtomic <= 0n) return { kind: "clarification",
    question: "The requested conversion amount is too small." };
  return {
    kind: "staged-conversion", templateId: "staged-conversion", inputs,
    outputToken: output.address, outputSymbol: output.symbol, outputDecimals: output.decimals,
    ...(draft.minimumStages > inputs.length ? { minimumStages: draft.minimumStages } : {}),
    minimum: formatAtomicAmount(minimumAtomic, output.decimals), minimumSource: "market-default",
    maxSolverFeeUsd: "0",
  };
}
