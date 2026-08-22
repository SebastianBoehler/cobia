import {
  decimalToAtomic, INTENT_ASSETS, NATIVE_INTENT_ASSET, RWA_INTENT_ASSETS,
  stablecoinDefaultMinimum, type CapabilityTemplateId, type IntentReceiptValues,
} from "./capability-templates";
import { formatAtomicAmount } from "./market-minimum";
import type { WalletBalances } from "./wallet-balance-request";

interface ModelAmountHints {
  amount: string;
  conversion?: { inputs: Array<{ symbol: string; amount: string }> } | null;
}

export function requestedRwaTarget(goal: string) {
  const matches = RWA_INTENT_ASSETS.filter(({ symbol }) =>
    new RegExp(`(^|[^A-Za-z0-9])@?${symbol}(?=$|[^A-Za-z0-9])`, "i").test(goal));
  return matches.length === 1 ? matches[0] : undefined;
}

export function requestedRwaInput(goal: string) {
  const symbol = [...goal.matchAll(/@?(OKB|USDG|USDt0)(?=$|[^A-Za-z0-9])/gi)][0]?.[1];
  if (!symbol) return undefined;
  return [NATIVE_INTENT_ASSET, ...INTENT_ASSETS].find((asset) =>
    asset.symbol.toLowerCase() === symbol.toLowerCase());
}

export function requestedRoundTripAsset(goal: string) {
  if (!/\b(?:round[ -]?trip|back\s+into)\b/i.test(goal)) return undefined;
  const symbols = [...goal.matchAll(/@?(OKB|USDG|USDt0)(?=$|[^A-Za-z0-9])/gi)]
    .map((match) => match[1]!.toLowerCase());
  if (symbols.length < 2 || symbols[0] !== symbols.at(-1)) return undefined;
  return INTENT_ASSETS.find(({ symbol }) => symbol.toLowerCase() === symbols[0]);
}

export function requestedInputAmount(input: {
  goal: string;
  symbol: string;
  decimals: number;
  compiled?: ModelAmountHints;
  balances?: WalletBalances;
}): string | undefined {
  const balance = Object.entries(input.balances ?? {}).find(([candidate]) =>
    candidate.toLowerCase() === input.symbol.toLowerCase())?.[1];
  if (/\b(?:all|entire|full|whole)\b/i.test(input.goal)) return balance;
  const percent = input.goal.match(/(\d+(?:\.\d{1,2})?)\s*%/i)?.[1];
  const bps = percent && decimalToAtomic(percent, 2);
  const balanceAtomic = balance && decimalToAtomic(balance, input.decimals);
  if (bps && balanceAtomic && BigInt(bps) <= 10_000n) {
    const amount = BigInt(balanceAtomic) * BigInt(bps) / 10_000n;
    return amount > 0n ? formatAtomicAmount(amount, input.decimals) : undefined;
  }
  const exact = input.goal.match(new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*@?${input.symbol}(?=$|[^A-Za-z0-9])`, "i",
  ))?.[1];
  const modelAmount = input.compiled?.conversion?.inputs.find((item) =>
    item.symbol.toLowerCase() === input.symbol.toLowerCase())?.amount ||
    input.compiled?.amount || exact || "";
  return decimalToAtomic(modelAmount, input.decimals) ? modelAmount : undefined;
}

export function resolveSimpleReceipt(
  compiled: { templateId: CapabilityTemplateId; inputSymbol: string; outputSymbol: string;
    amount: string; minimum: string; jurisdiction: string | null },
  minimumSource?: IntentReceiptValues["minimumSource"],
): IntentReceiptValues {
  const rwaOutput = compiled.templateId === "rwa-acquisition"
    ? RWA_INTENT_ASSETS.find(({ symbol }) => symbol === compiled.outputSymbol) : undefined;
  const output = rwaOutput ?? INTENT_ASSETS.find(({ symbol }) => symbol === compiled.outputSymbol);
  const input = [NATIVE_INTENT_ASSET, ...INTENT_ASSETS].find(
    ({ symbol }) => symbol === compiled.inputSymbol);
  const defaultMinimum = compiled.templateId === "exact-input-swap" && input && output &&
    !compiled.minimum ? stablecoinDefaultMinimum(input, output, compiled.amount) : null;
  const minimum = compiled.minimum || defaultMinimum;
  if (!input || !output || !compiled.amount ||
      (compiled.templateId !== "aave-supply" && !minimum)) {
    throw new Error("Intent compiler omitted a required signed bound");
  }
  const crossChainTarget = rwaOutput?.instrument.chainId === 1;
  return { templateId: compiled.templateId,
    inputToken: crossChainTarget ? input.address.toLowerCase() as typeof input.address : input.address,
    outputToken: output.address, amount: compiled.amount, minimum: minimum ?? "",
    minimumSource: minimumSource ?? (defaultMinimum ? "stablecoin-default" : undefined),
    maxSolverFeeUsd: "0", jurisdiction: crossChainTarget ? "" : compiled.jurisdiction ?? "",
    eligibilityAccepted: false };
}
