import { and, desc, eq } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { cobiaActivityEvents } from "./schema";

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function createActivityRepository(db: CobiaDatabase) {
  return {
    async listActivity(wallet: string, executionChainId: number) {
      return db.query.cobiaActivityEvents.findMany({
        where: and(
          eq(cobiaActivityEvents.wallet, normalizeAddress(wallet)),
          eq(cobiaActivityEvents.executionChainId, executionChainId),
        ),
        orderBy: [desc(cobiaActivityEvents.occurredAt)],
      });
    },
  };
}
