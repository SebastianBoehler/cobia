import type {
  PersistedStablecoinPolicy,
  RouteQuote,
  RouteQuoteV2,
} from "@cobia/domain";

export type PublicMarketQuote = RouteQuote | RouteQuoteV2;

export function quoteApyBps(quote: PublicMarketQuote): number {
  return quote.version === 1
    ? quote.expectedNetApyBps
    : quote.estimatedPreGasApyBps;
}

export function quoteApyLabel(quote: PublicMarketQuote): string {
  return quote.version === 1
    ? "snapshot-derived portfolio APY"
    : "estimated pre-gas APY";
}

export function exposureLabel(policy: PersistedStablecoinPolicy): string {
  return policy.version === 1
    ? `${(policy.maxProtocolExposureBps / 100).toFixed(0)}% maximum exposure`
    : `${(policy.protocolExposureBps / 100).toFixed(0)}% signed protocol exposure`;
}

export function protocolSourceLabel(
  policy: PersistedStablecoinPolicy,
  protocols: readonly string[],
  sourceApyBps: number,
): string {
  const names = protocols.join(", ") || "No protocol allocation";
  const rate = (sourceApyBps / 100).toFixed(2);
  return policy.version === 1
    ? `${names} source rate ${rate}%`
    : `Snapshot protocols: ${names} · highest Aave supply rate ${rate}%`;
}
