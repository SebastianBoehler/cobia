import type { WalletIntentAsset } from "./staged-conversion-draft";

function taggedSymbols(goal: string): string[] {
  return [...new Map([...goal.matchAll(/@([A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*)/g)]
    .map((match) => [match[1]!.toLowerCase(), match[1]!])).values()];
}

export function exactTaggedWalletInputs(
  goal: string,
  outputSymbol: string,
  walletAssets: readonly WalletIntentAsset[],
): string[] {
  const assets = new Map(["OKB", ...walletAssets.map(({ symbol }) => symbol)]
    .map((symbol) => [symbol.toLowerCase(), symbol]));
  return taggedSymbols(goal).flatMap((symbol) => {
    const walletSymbol = assets.get(symbol.toLowerCase());
    return walletSymbol && walletSymbol.toLowerCase() !== outputSymbol.toLowerCase() ? [walletSymbol] : [];
  });
}

export function hasExactTaggedWalletInputs(
  goal: string,
  outputSymbol: string,
  inputSymbols: readonly string[],
  walletAssets: readonly WalletIntentAsset[],
): boolean {
  const expected = exactTaggedWalletInputs(goal, outputSymbol, walletAssets);
  if (!expected.length) return true;
  if (expected.length !== inputSymbols.length) return false;
  const actual = new Set(inputSymbols.map((symbol) => symbol.toLowerCase()));
  return expected.every((symbol) => actual.has(symbol.toLowerCase()));
}

export function preserveExactTaggedWalletInputs<T extends { symbol: string }>(
  goal: string,
  outputSymbol: string,
  inputs: readonly T[],
  walletAssets: readonly WalletIntentAsset[],
): T[] | undefined {
  const expected = exactTaggedWalletInputs(goal, outputSymbol, walletAssets);
  if (!expected.length) return [...inputs];
  if (expected.length !== inputs.length) return undefined;
  const remaining = new Set(expected.map((symbol) => symbol.toLowerCase()));
  const repaired: T[] = [];
  for (const input of inputs) {
    const requested = input.symbol.toLowerCase();
    const suffixCandidates = [...remaining].filter((symbol) => symbol.endsWith(requested));
    const matched = remaining.has(requested)
      ? requested
      : suffixCandidates.length === 1 ? suffixCandidates[0] : undefined;
    if (!matched) return undefined;
    remaining.delete(matched);
    repaired.push({ ...input, symbol: expected.find((symbol) =>
      symbol.toLowerCase() === matched)! });
  }
  return remaining.size === 0 ? repaired : undefined;
}
