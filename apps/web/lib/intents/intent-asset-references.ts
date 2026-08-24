function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tagKnownAssetSymbols(
  value: string,
  assetSymbols: readonly string[],
): string {
  const candidates = new Map<string, string[]>();
  for (const symbol of assetSymbols) {
    const key = symbol.toLowerCase();
    candidates.set(key, [...(candidates.get(key) ?? []), symbol]);
  }

  return [...candidates.values()]
    .filter((symbols) => symbols.length === 1)
    .sort(([left], [right]) => right!.length - left!.length)
    .reduce((text, [symbol]) => text.replace(
      new RegExp(`(?<![@A-Za-z0-9])${escapeRegExp(symbol!)}(?![A-Za-z0-9])`, "gi"),
      `@${symbol}`,
    ), value);
}

interface AssetFlow {
  inputs: readonly string[];
  output?: string;
}

function canonicalTaggedAssets(value: string, assetSymbols: readonly string[]) {
  const candidates = new Map<string, string[]>();
  for (const symbol of assetSymbols) {
    const key = symbol.toLowerCase();
    candidates.set(key, [...(candidates.get(key) ?? []), symbol]);
  }
  return [...value.matchAll(/@([A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*)/g)].flatMap((match) => {
    const matches = candidates.get(match[1]!.toLowerCase());
    return matches?.length === 1 ? [{ symbol: matches[0]!, index: match.index }] : [];
  });
}

function equalSymbols(left: readonly string[], right: readonly string[]): boolean {
  const expected = new Set(left.map((symbol) => symbol.toLowerCase()));
  const actual = new Set(right.map((symbol) => symbol.toLowerCase()));
  return expected.size === actual.size && [...expected].every((symbol) => actual.has(symbol));
}

export function preservesRequestedAssetFlow(
  goal: string,
  compiled: AssetFlow,
  assetSymbols: readonly string[],
): boolean {
  const requested = canonicalTaggedAssets(goal, assetSymbols);
  if (!requested.length) return true;

  const connector = [...goal.matchAll(/\b(?:into|to|for)\b/gi)].find((match) =>
    requested.some(({ index }) => index < match.index!) &&
    requested.some(({ index }) => index > match.index!));
  if (connector) {
    const inputs = requested.filter(({ index }) => index < connector.index!).map(({ symbol }) => symbol);
    const output = requested.find(({ index }) => index > connector.index!)?.symbol;
    return Boolean(output) && equalSymbols(inputs, compiled.inputs) &&
      output!.toLowerCase() === compiled.output?.toLowerCase();
  }

  return equalSymbols(requested.map(({ symbol }) => symbol), [
    ...compiled.inputs, ...(compiled.output ? [compiled.output] : []),
  ]);
}
