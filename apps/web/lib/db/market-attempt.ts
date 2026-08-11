import {
  type PersistedSnapshot,
  type PersistedStablecoinPolicy,
} from "@cobia/domain";
import {
  isActiveRequestState,
  publishedRequestQuotes,
  visibleRequestQuotes,
} from "../markets/active-quotes";
import type { MarketAttempt } from "./market-types";
import {
  parsePersistedPolicy,
  parsePersistedSnapshot,
  parsePublicPersistedQuote,
  type PublicPersistedQuote,
} from "./persisted-round";

const runningStates = new Set(["open", "collecting", "verifying"]);

export interface AttemptProjection {
  requestId: string;
  policy: PersistedStablecoinPolicy;
  snapshot: PersistedSnapshot | null;
  state: string;
  selectedQuoteId: string | null;
  createdAt: Date;
}

function visibleQuotes(
  input: AttemptProjection,
  quotes: PublicPersistedQuote[],
  nowSec: number,
): Pick<MarketAttempt, "quotes" | "quoteEligibility"> {
  const visibility = {
    state: input.state,
    selectedQuoteId: input.selectedQuoteId,
    quotes,
  };
  const published = publishedRequestQuotes(visibility);
  const active = isActiveRequestState(input.state)
    ? visibleRequestQuotes(visibility, nowSec)
    : [];
  if (active.length > 0) return { quotes: active, quoteEligibility: "active" };
  return published.length > 0
    ? { quotes: published, quoteEligibility: "inactive" }
    : { quotes: [], quoteEligibility: "none" };
}

export function projectMarketAttempt(
  input: AttemptProjection,
  storedQuotes: unknown[],
  nowSec: number,
): MarketAttempt {
  const policy = parsePersistedPolicy(input.policy);
  const quotes = storedQuotes.map(parsePublicPersistedQuote);
  const snapshot = input.snapshot ? parsePersistedSnapshot(input.snapshot) : null;
  const lifecycle = runningStates.has(input.state)
    ? "running"
    : input.state === "failed" ? "failed" : "completed";
  return {
    requestId: input.requestId,
    policy,
    ...visibleQuotes(input, quotes, nowSec),
    state: input.state,
    lifecycle,
    blockNumber: snapshot?.blockNumber ?? null,
    sourceApyBps: snapshot?.version === 1
      ? Math.max(0, ...snapshot.candidates.map(({ apyBps }) => apyBps))
      : Math.max(0, ...snapshot?.opportunities.flatMap((opportunity) =>
        opportunity.kind === "aave-v3-supply" ? [opportunity.supplyRateBps] : []
      ) ?? []),
    protocols: snapshot?.version === 1
      ? [...new Set(snapshot.candidates
        .filter(({ kind }) => kind !== "cash")
        .map(({ kind }) => kind === "aave-v3" ? "Aave V3" : kind))]
      : [...new Set(snapshot?.opportunities.map(({ kind }) =>
        kind === "aave-v3-supply" ? "Aave V3" : "Uniswap V3"
      ) ?? [])],
    createdAt: input.createdAt.toISOString(),
  };
}
