import { RouteQuoteSchema, StablecoinPolicySchema } from "@cobia/domain";
import { desc, eq } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { cobiaQuotes, cobiaRequests } from "./schema";

export interface StoredMarket {
  id: string;
  requestId: string;
  policy: ReturnType<typeof StablecoinPolicySchema.parse>;
  quotes: ReturnType<typeof RouteQuoteSchema.parse>[];
  state: string;
  blockNumber: string | null;
  sourceApyBps: number;
  protocols: string[];
  createdAt: string;
  status: "current" | "historical";
}

export function createMarketRepository(db: CobiaDatabase) {
  async function listMarkets(nowSec: number): Promise<StoredMarket[]> {
    const rows = await db.select({ request: cobiaRequests, quote: cobiaQuotes })
      .from(cobiaQuotes)
      .innerJoin(cobiaRequests, eq(cobiaQuotes.requestId, cobiaRequests.id))
      .orderBy(desc(cobiaRequests.createdAt));
    const grouped = new Map<string, StoredMarket>();
    for (const row of rows) {
      const quote = RouteQuoteSchema.parse(row.quote.publicQuote);
      const current = grouped.get(row.request.id);
      if (current) {
        current.quotes.push(quote);
        if (quote.validUntil > nowSec) current.status = "current";
        continue;
      }
      grouped.set(row.request.id, {
        id: row.request.id,
        requestId: row.request.id,
        policy: StablecoinPolicySchema.parse(row.request.policy),
        quotes: [quote],
        state: row.request.state,
        blockNumber: row.request.snapshot?.blockNumber ?? null,
        sourceApyBps: Math.max(0, ...(row.request.snapshot?.candidates.map((candidate) => candidate.apyBps) ?? [])),
        protocols: [...new Set(row.request.snapshot?.candidates
          .filter((candidate) => candidate.kind !== "cash")
          .map((candidate) => candidate.kind === "aave-v3" ? "Aave V3" : candidate.kind) ?? [])],
        createdAt: row.request.createdAt.toISOString(),
        status: quote.validUntil > nowSec ? "current" : "historical",
      });
    }
    return [...grouped.values()];
  }

  return {
    listMarkets,
    async getMarket(id: string, nowSec: number) {
      return (await listMarkets(nowSec)).find((market) => market.id === id);
    },
  };
}
