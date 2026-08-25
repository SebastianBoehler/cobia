import { isNativeAssetAddress } from "@cobia/domain";
import type { Address } from "viem";
import { decimalToAtomic } from "./capability-templates";

export interface GoalAssetReference {
  symbol: string;
  chainId: 1 | 196;
  address: Address;
  decimals: number;
}

type Result =
  | { status: "not-applicable" }
  | { status: "clarification"; question: string }
  | {
      status: "request";
      input: { chainId: 1 | 196; address: Address; maximumAtomic: string };
      output: { chainId: 1 | 196; address: Address; minimumAtomic?: string };
    };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amountBeforeSymbol(goal: string, symbol: string, prefix = ""): string | undefined {
  return new RegExp(`${prefix}\\s*(\\d+(?:\\.\\d+)?)\\s+@?${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9])`, "i")
    .exec(goal)?.[1];
}

function describedAsInput(goal: string, symbol: string): boolean {
  const asset = `@?${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9])`;
  const qualifiers = `(?:(?:all|my|the|full|entire|whole|available|of|up\\s+to|at\\s+most)\\s+)*`;
  const amount = `(?:\\d+(?:\\.\\d+)?\\s+)?`;
  return new RegExp(`\\b(?:with|using|from|spend(?:ing)?|sell(?:ing)?|swap(?:ping)?|` +
    `convert(?:ing)?|exchange|turn)\\s+${qualifiers}${amount}${asset}`, "i").test(goal) ||
    new RegExp(`\\d+(?:\\.\\d+)?\\s+${asset}\\s+worth\\b`, "i").test(goal);
}

function requiresStructuredComposition(goal: string): boolean {
  return /\b(?:round[- ]?trip|and\s+back|back\s+to|multi[- ]?step)\b/i.test(goal) ||
    /\bat\s+least\s+\d+\s+(?:wallet\s+)?(?:steps|stages|transactions|swaps|actions)\b/i.test(goal);
}

export function generalAssetRequestFromGoal(
  goal: string,
  assets: readonly GoalAssetReference[],
  walletBalancesByAddress: Readonly<Record<string, string>> = {},
): Result {
  if (requiresStructuredComposition(goal)) return { status: "not-applicable" };
  const requested = assets.filter(({ symbol }, index) => assets.findIndex((candidate) =>
    candidate.symbol.toLowerCase() === symbol.toLowerCase()) === index).filter(({ symbol }) =>
    new RegExp(`@${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9])`, "i").test(goal));
  if (requested.length !== 2) return { status: "not-applicable" };

  let output = requested.find(({ symbol }) => amountBeforeSymbol(goal, symbol, "\\bat least"));
  let input = requested.find(({ symbol }) => symbol.toLowerCase() !== output?.symbol.toLowerCase());
  if (!output) {
    const describedInputs = requested.filter(({ symbol }) => describedAsInput(goal, symbol));
    const fundedInputs = requested.filter(({ address }) =>
      /^[1-9]\d*$/.test(walletBalancesByAddress[address.toLowerCase()] ?? ""));
    input = describedInputs.length === 1 ? describedInputs[0]
      : fundedInputs.length === 1 ? fundedInputs[0] : undefined;
    output = requested.find(({ address }) => address.toLowerCase() !== input?.address.toLowerCase());
  }
  if (!input || !output) return { status: "clarification",
    question: "Tag one input asset and one output asset so Cobia can bind their exact contracts." };
  if (isNativeAssetAddress(input.address)) return { status: "clarification",
    question: "The active exact-asset verifier requires an ERC-20 input; native OKB is not yet verified for this route." };
  const explicitInput = amountBeforeSymbol(goal, input.symbol);
  const walletBalance = walletBalancesByAddress[input.address.toLowerCase()];
  const maximumAtomic = explicitInput
    ? decimalToAtomic(explicitInput, input.decimals)
    : walletBalance && /^[1-9]\d*$/.test(walletBalance) ? walletBalance : undefined;
  const explicitMinimum = amountBeforeSymbol(goal, output.symbol, "\\bat least") ??
    amountBeforeSymbol(goal, output.symbol);
  const minimumAtomic = explicitMinimum ? decimalToAtomic(explicitMinimum, output.decimals) : undefined;
  if (!maximumAtomic) return { status: "clarification",
    question: `No positive ${input.symbol} wallet balance is available. Fund it or state a maximum amount.` };
  return { status: "request", input: { chainId: input.chainId, address: input.address, maximumAtomic },
    output: { chainId: output.chainId, address: output.address,
      ...(minimumAtomic ? { minimumAtomic } : {}) } };
}
