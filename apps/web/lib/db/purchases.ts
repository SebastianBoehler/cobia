import { DecisionBundleSchema, commitment, type DecisionBundle } from "@cobia/domain";
import { and, eq } from "drizzle-orm";
import type { Address } from "viem";
import type { CobiaDatabase } from "./client";
import { cobiaRoutePurchases } from "./schema";

export interface RoutePurchaseInput {
  id: string;
  requestId: string;
  quoteId: string;
  buyer: Address;
  chainId: number;
  receiptHash: string;
  bundle: DecisionBundle;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function createPurchaseRepository(db: CobiaDatabase) {
  return {
    async recordRoutePurchase(input: RoutePurchaseInput): Promise<void> {
      const bundle = DecisionBundleSchema.parse(input.bundle);
      if (commitment(bundle) !== input.quoteId || input.id !== input.quoteId) {
        throw new Error("Route purchase commitment mismatch");
      }
      await db.insert(cobiaRoutePurchases).values({
        ...input,
        buyer: normalizeAddress(input.buyer),
        bundle,
      }).onConflictDoNothing({ target: cobiaRoutePurchases.id });

      const stored = await db.query.cobiaRoutePurchases.findFirst({
        where: eq(cobiaRoutePurchases.id, input.id),
      });
      if (
        !stored ||
        stored.quoteId !== input.quoteId ||
        stored.receiptHash !== input.receiptHash ||
        stored.buyer !== normalizeAddress(input.buyer)
      ) {
        throw new Error("Route purchase conflicts with the stored receipt");
      }
    },

    async getPurchasedRoute(routeId: string, buyer: string) {
      const stored = await db.query.cobiaRoutePurchases.findFirst({
        where: and(
          eq(cobiaRoutePurchases.id, routeId),
          eq(cobiaRoutePurchases.buyer, normalizeAddress(buyer)),
        ),
      });
      if (!stored) return undefined;
      return { ...stored, bundle: DecisionBundleSchema.parse(stored.bundle) };
    },

    async listPurchasedRoutes(buyer: string, chainId: number) {
      const rows = await db.query.cobiaRoutePurchases.findMany({
        where: and(
          eq(cobiaRoutePurchases.buyer, normalizeAddress(buyer)),
          eq(cobiaRoutePurchases.chainId, chainId),
        ),
      });
      return rows.map((row) => ({ ...row, bundle: DecisionBundleSchema.parse(row.bundle) }));
    },
  };
}
