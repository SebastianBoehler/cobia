export type WalletBalances = Readonly<Record<string, string>>;

export type WalletBalanceShare =
  | { kind: "fraction"; numerator: bigint; denominator: bigint }
  | { kind: "ambiguous" };

export function requestsWalletBalance(goal: string): boolean {
  return /\b(?:all|half|most|some|part)\s+(?:of\s+)?my\b|\b(?:(?:a|one)\s+)?quarter\s+(?:of\s+)?my\b|\bthree[-\s]+quarters\s+(?:of\s+)?my\b|\b\d+(?:\.\d+)?\s*(?:%|percent)\s+(?:of\s+)?my\b|\b(?:entire|full|whole)\s+(?:wallet\s+)?balance\b|\bmy\s+(?:entire|full|whole)\b/i
    .test(goal);
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function walletBalanceShare(goal: string, symbol: string): WalletBalanceShare | undefined {
  const asset = `@?${escaped(symbol)}`;
  const suffix = `(?:\\s+(?:wallet\\s+)?balance)?`;
  const percentage = goal.match(new RegExp(
    `\\b(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)\\s+(?:of\\s+)?my\\s+${asset}${suffix}\\b`, "i",
  ));
  if (percentage) {
    const [whole, fraction = ""] = percentage[1]!.split(".");
    const denominator = 100n * 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole}${fraction}`);
    return numerator > 0n && numerator <= denominator
      ? { kind: "fraction", numerator, denominator } : { kind: "ambiguous" };
  }
  const patterns: Array<[RegExp, bigint, bigint]> = [
    [new RegExp(`\\b(?:all(?:\\s+of)?\\s+my|my\\s+(?:entire|full|whole)(?:\\s+wallet)?)\\s+${asset}${suffix}\\b`, "i"), 1n, 1n],
    [new RegExp(`\\bhalf\\s+(?:of\\s+)?my\\s+${asset}${suffix}\\b`, "i"), 1n, 2n],
    [new RegExp(`\\b(?:(?:a|one)\\s+)?quarter\\s+(?:of\\s+)?my\\s+${asset}${suffix}\\b`, "i"), 1n, 4n],
    [new RegExp(`\\bthree[-\\s]+quarters\\s+(?:of\\s+)?my\\s+${asset}${suffix}\\b`, "i"), 3n, 4n],
  ];
  for (const [pattern, numerator, denominator] of patterns) {
    if (pattern.test(goal)) return { kind: "fraction", numerator, denominator };
  }
  if (new RegExp(`\\b(?:most|some|part)\\s+(?:of\\s+)?my\\s+${asset}${suffix}\\b`, "i").test(goal)) {
    return { kind: "ambiguous" };
  }
  return undefined;
}

function formatAtomic(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function applyWalletBalanceShare(
  balanceAtomic: bigint,
  decimals: number,
  share: Extract<WalletBalanceShare, { kind: "fraction" }>,
): string | undefined {
  const amount = balanceAtomic * share.numerator / share.denominator;
  return amount > 0n ? formatAtomic(amount, decimals) : undefined;
}
