import type { RouteQuote, RouteQuoteV2 } from "@cobia/domain";

export type PublicRouteQuote = RouteQuote | RouteQuoteV2;

const activeRequestStates = new Set(["quotes_ready", "partial"]);
const selectedRequestStates = new Set([
  "selected",
  "payment_pending",
  "paid",
  "revealed",
  "executed",
]);

export function isActiveRouteQuote(
  quote: PublicRouteQuote,
  nowSec: number,
): boolean {
  const authorized = quote.version === 1
    ? quote.verification.executable
    : quote.authorization.routeAuthorized;
  return authorized && quote.validUntil > nowSec;
}

export interface ActiveQuoteFreshness {
  observedAtSec: number;
  nextExpirySec: number | null;
}

const MAX_BROWSER_TIMER_DELAY_MS = 2_147_000_000;

export function activeQuoteFreshness(
  quotes: readonly PublicRouteQuote[],
  observedAtSec: number,
): ActiveQuoteFreshness {
  const expiries = quotes
    .filter((quote) => isActiveRouteQuote(quote, observedAtSec))
    .map((quote) => quote.validUntil);
  return {
    observedAtSec,
    nextExpirySec: expiries.length > 0 ? Math.min(...expiries) : null,
  };
}

export function refreshDelayMs(freshness: ActiveQuoteFreshness): number | null {
  if (freshness.nextExpirySec === null) return null;
  return Math.min(
    MAX_BROWSER_TIMER_DELAY_MS,
    Math.max(0, (freshness.nextExpirySec - freshness.observedAtSec) * 1_000),
  );
}

interface RequestQuoteVisibility<TQuote extends PublicRouteQuote> {
  state: string;
  selectedQuoteId: string | null;
  quotes: TQuote[];
}

export function publishedRequestQuotes<TQuote extends PublicRouteQuote>(
  input: RequestQuoteVisibility<TQuote>,
): TQuote[] {
  if (activeRequestStates.has(input.state)) return input.quotes;
  if (selectedRequestStates.has(input.state) && input.selectedQuoteId) {
    return input.quotes.filter((quote) => quote.quoteId === input.selectedQuoteId);
  }
  return [];
}

export function visibleRequestQuotes<TQuote extends PublicRouteQuote>(
  input: RequestQuoteVisibility<TQuote>,
  nowSec: number,
): TQuote[] {
  const published = publishedRequestQuotes(input);
  return activeRequestStates.has(input.state)
    ? published.filter((quote) => isActiveRouteQuote(quote, nowSec))
    : published;
}

export function isActiveRequestState(state: string): boolean {
  return activeRequestStates.has(state);
}
