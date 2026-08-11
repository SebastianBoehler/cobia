import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { isAddress, type Address } from "viem";
import { projectMarketAttempt, type AttemptProjection } from "./market-attempt";
import type { CobiaDatabase } from "./client";
import type {
  MarketHistoryPage,
  MarketResolution,
  StoredMarketDetail,
  StoredMarketSummary,
} from "./market-types";
import { cobiaMarkets, cobiaQuotes, cobiaRequests } from "./schema";

export type {
  MarketAttempt,
  MarketHistoryPage,
  MarketResolution,
  StoredMarketDetail,
  StoredMarketSummary,
} from "./market-types";

const activeStates = ["quotes_ready", "partial"] as const;
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

const attemptColumns = {
  requestId: cobiaRequests.id,
  policy: cobiaRequests.policy,
  snapshot: cobiaRequests.snapshot,
  state: cobiaRequests.state,
  selectedQuoteId: cobiaRequests.selectedQuoteId,
  createdAt: cobiaRequests.createdAt,
};

interface Cursor {
  createdAt: Date;
  requestId: string;
}

function historyLimit(input?: number): number {
  if (input === undefined) return DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(input) || input < 1 || input > MAX_HISTORY_LIMIT) {
    throw new Error(`Market history limit must be between 1 and ${MAX_HISTORY_LIMIT}`);
  }
  return input;
}

function encodeCursor(attempt: AttemptProjection): string {
  return Buffer.from(JSON.stringify({
    createdAt: attempt.createdAt.toISOString(),
    requestId: attempt.requestId,
  })).toString("base64url");
}

function decodeCursor(value?: string): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    const { createdAt, requestId } = parsed as Record<string, unknown>;
    const date = new Date(String(createdAt));
    if (!requestIdPattern.test(String(requestId)) || Number.isNaN(date.valueOf())) {
      throw new Error("invalid");
    }
    return { createdAt: date, requestId: String(requestId) };
  } catch {
    throw new Error("Invalid market history cursor");
  }
}

function marketAddress(value: string): Address {
  if (value !== value.toLowerCase() || !isAddress(value)) {
    throw new Error("Stored market asset is not canonical");
  }
  return value;
}

function isCanonicalMarketId(value: string): boolean {
  const [chain, asset, extra] = value.split(":");
  return extra === undefined && chain === "196" && asset === asset?.toLowerCase()
    && isAddress(asset ?? "");
}

export function createMarketRepository(db: CobiaDatabase) {
  async function counts(marketIds: string[]) {
    if (marketIds.length === 0) return new Map<string, {
      requestAttemptCount: number;
      quoteBearingAttemptCount: number;
    }>();
    const rows = await db.select({
      marketId: cobiaRequests.marketId,
      requestAttemptCount: sql<number>`count(distinct ${cobiaRequests.id})`.mapWith(Number),
      quoteBearingAttemptCount: sql<number>`count(distinct case
        when ${cobiaQuotes.id} is not null then ${cobiaRequests.id} end)`.mapWith(Number),
    }).from(cobiaRequests)
      .leftJoin(cobiaQuotes, eq(cobiaQuotes.requestId, cobiaRequests.id))
      .where(inArray(cobiaRequests.marketId, marketIds))
      .groupBy(cobiaRequests.marketId);
    return new Map(rows.map(({ marketId, ...count }) => [marketId, count]));
  }

  async function activeAttempts(nowSec: number, marketId?: string) {
    const rows = await db.select({
      ...attemptColumns,
      marketId: cobiaRequests.marketId,
      executionChainId: cobiaMarkets.executionChainId,
      asset: cobiaMarkets.asset,
      publicQuote: cobiaQuotes.publicQuote,
    }).from(cobiaRequests)
      .innerJoin(cobiaMarkets, eq(cobiaMarkets.id, cobiaRequests.marketId))
      .innerJoin(cobiaQuotes, eq(cobiaQuotes.requestId, cobiaRequests.id))
      .where(and(
        marketId ? eq(cobiaRequests.marketId, marketId) : undefined,
        inArray(cobiaRequests.state, activeStates),
        eq(cobiaQuotes.executable, true),
        sql`(${cobiaQuotes.publicQuote}->>'validUntil')::bigint > ${nowSec}`,
      ))
      .orderBy(desc(cobiaRequests.createdAt), desc(cobiaRequests.id));
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.marketId}:${row.requestId}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }
    return [...grouped.values()].map((attemptRows) => {
      const first = attemptRows[0]!;
      return {
        marketId: first.marketId,
        executionChainId: first.executionChainId,
        asset: marketAddress(first.asset),
        attempt: projectMarketAttempt(
          first,
          attemptRows.map(({ publicQuote }) => publicQuote),
          nowSec,
        ),
      };
    }).filter(({ attempt }) => attempt.quoteEligibility === "active");
  }

  async function attemptPage(marketId: string, page: MarketHistoryPage) {
    const limit = historyLimit(page.limit);
    const cursor = decodeCursor(page.cursor);
    const rows = await db.select(attemptColumns).from(cobiaRequests)
      .where(and(
        eq(cobiaRequests.marketId, marketId),
        cursor ? or(
          lt(cobiaRequests.createdAt, cursor.createdAt),
          and(
            eq(cobiaRequests.createdAt, cursor.createdAt),
            lt(cobiaRequests.id, cursor.requestId),
          ),
        ) : undefined,
      ))
      .orderBy(desc(cobiaRequests.createdAt), desc(cobiaRequests.id))
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    return {
      rows: pageRows,
      nextCursor: rows.length > limit && pageRows.length > 0
        ? encodeCursor(pageRows[pageRows.length - 1]!)
        : null,
    };
  }

  async function projectAttempts(rows: AttemptProjection[], nowSec: number) {
    const requestIds = rows.map(({ requestId }) => requestId);
    const quoteRows = requestIds.length === 0 ? [] : await db.select({
      requestId: cobiaQuotes.requestId,
      publicQuote: cobiaQuotes.publicQuote,
    }).from(cobiaQuotes).where(and(
      inArray(cobiaQuotes.requestId, requestIds),
      eq(cobiaQuotes.executable, true),
    ));
    const quotes = new Map<string, unknown[]>();
    for (const row of quoteRows) {
      const current = quotes.get(row.requestId) ?? [];
      current.push(row.publicQuote);
      quotes.set(row.requestId, current);
    }
    return rows.map((row) => projectMarketAttempt(row, quotes.get(row.requestId) ?? [], nowSec));
  }

  async function resolveIdentity(id: string) {
    if (isCanonicalMarketId(id)) {
      const market = await db.query.cobiaMarkets.findFirst({
        columns: { id: true, executionChainId: true, asset: true },
        where: eq(cobiaMarkets.id, id),
      });
      return market ? { market, resolvedFrom: "market" as const } : undefined;
    }
    if (!requestIdPattern.test(id)) return undefined;
    const row = (await db.select({
      id: cobiaMarkets.id,
      executionChainId: cobiaMarkets.executionChainId,
      asset: cobiaMarkets.asset,
    }).from(cobiaRequests)
      .innerJoin(cobiaMarkets, eq(cobiaMarkets.id, cobiaRequests.marketId))
      .where(eq(cobiaRequests.id, id)))[0];
    return row ? { market: row, resolvedFrom: "attempt" as const } : undefined;
  }

  async function resolveMarket(
    id: string,
    nowSec: number,
    page: MarketHistoryPage = {},
  ): Promise<MarketResolution | undefined> {
    const resolution = await resolveIdentity(id);
    if (!resolution) return undefined;
    const marketId = resolution.market.id;
    const history = await attemptPage(marketId, page);
    const latestRow = page.cursor
      ? (await attemptPage(marketId, { limit: 1 })).rows[0]
      : history.rows[0];
    if (!latestRow) return undefined;
    const uniqueRows = [...new Map(
      [...history.rows, latestRow].map((row) => [row.requestId, row]),
    ).values()];
    const projected = await projectAttempts(uniqueRows, nowSec);
    const attemptsById = new Map(projected.map((attempt) => [attempt.requestId, attempt]));
    const latestActiveAttempt = (await activeAttempts(nowSec, marketId))[0]?.attempt ?? null;
    const count = (await counts([marketId])).get(marketId);
    if (!count) return undefined;
    const market: StoredMarketDetail = {
      id: marketId,
      executionChainId: 196,
      asset: marketAddress(resolution.market.asset),
      ...count,
      latestActiveAttempt,
      mostRecentAttempt: attemptsById.get(latestRow.requestId)!,
      attempts: history.rows.map((row) => attemptsById.get(row.requestId)!),
      nextCursor: history.nextCursor,
    };
    return { canonicalId: marketId, resolvedFrom: resolution.resolvedFrom, market };
  }

  return {
    async listMarkets(nowSec: number): Promise<StoredMarketSummary[]> {
      const active = await activeAttempts(nowSec);
      const latest = new Map<string, (typeof active)[number]>();
      for (const row of active) if (!latest.has(row.marketId)) latest.set(row.marketId, row);
      const countRows = await counts([...latest.keys()]);
      return [...latest.values()].map((row) => ({
        id: row.marketId,
        executionChainId: 196,
        asset: row.asset,
        ...countRows.get(row.marketId)!,
        latestActiveAttempt: row.attempt,
      }));
    },
    resolveMarket,
    async getMarket(id: string, nowSec: number, page: MarketHistoryPage = {}) {
      return (await resolveMarket(id, nowSec, page))?.market;
    },
  };
}
