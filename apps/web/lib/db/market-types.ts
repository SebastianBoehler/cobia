import type {
  PersistedStablecoinPolicy,
  RouteQuote,
  RouteQuoteV2,
} from "@cobia/domain";
import type { Address } from "viem";

export type AttemptLifecycle = "running" | "completed" | "failed";
export type QuoteEligibility = "active" | "inactive" | "none";

export interface MarketAttempt {
  requestId: string;
  policy: PersistedStablecoinPolicy;
  quotes: (RouteQuote | RouteQuoteV2)[];
  state: string;
  lifecycle: AttemptLifecycle;
  quoteEligibility: QuoteEligibility;
  blockNumber: string | null;
  sourceApyBps: number;
  protocols: string[];
  createdAt: string;
}

interface MarketCounts {
  requestAttemptCount: number;
  quoteBearingAttemptCount: number;
}

interface MarketIdentity {
  id: string;
  executionChainId: 196;
  asset: Address;
}

export interface StoredMarketSummary extends MarketIdentity, MarketCounts {
  latestActiveAttempt: MarketAttempt;
}

export interface StoredMarketDetail extends MarketIdentity, MarketCounts {
  latestActiveAttempt: MarketAttempt | null;
  mostRecentAttempt: MarketAttempt;
  attempts: MarketAttempt[];
  nextCursor: string | null;
}

export interface MarketResolution {
  canonicalId: string;
  resolvedFrom: "market" | "attempt";
  market: StoredMarketDetail;
}

export interface MarketHistoryPage {
  limit?: number;
  cursor?: string;
}
