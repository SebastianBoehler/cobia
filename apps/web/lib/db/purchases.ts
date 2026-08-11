import { PersistedBundleSchema } from "@cobia/domain";
import { and, eq } from "drizzle-orm";
import type { CobiaDatabase } from "./client";
import { cobiaRoutePurchases } from "./schema";

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function createPurchaseRepository(db: CobiaDatabase) {
  return {
    async getPurchasedRoute(routeId: string, buyer: string) {
      const stored = await db.query.cobiaRoutePurchases.findFirst({
        where: and(
          eq(cobiaRoutePurchases.id, routeId),
          eq(cobiaRoutePurchases.buyer, normalizeAddress(buyer)),
        ),
      });
      if (!stored) return undefined;
      return { ...stored, bundle: PersistedBundleSchema.parse(stored.bundle) };
    },

    async listPurchasedRoutes(buyer: string, executionChainId: number) {
      const rows = await db.query.cobiaRoutePurchases.findMany({
        where: and(
          eq(cobiaRoutePurchases.buyer, normalizeAddress(buyer)),
          eq(cobiaRoutePurchases.executionChainId, executionChainId),
        ),
      });
      return rows.map((row) => ({ ...row, bundle: PersistedBundleSchema.parse(row.bundle) }));
    },
  };
}
