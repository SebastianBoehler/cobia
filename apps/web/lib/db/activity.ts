import { and, desc, eq } from "drizzle-orm";
import type { Address, Hash } from "viem";
import type { CobiaDatabase } from "./client";
import { cobiaActivityEvents } from "./schema";

export interface ActivityEventInput {
  id: string;
  wallet: Address;
  chainId: number;
  kind: "signature" | "payment" | "route_revealed" | "simulation" | "execution";
  status: "pending" | "confirmed" | "failed";
  routeId?: string;
  transactionHash?: Hash;
  detail: Record<string, unknown>;
  occurredAt: Date;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function createActivityRepository(db: CobiaDatabase) {
  return {
    async appendActivity(input: ActivityEventInput): Promise<void> {
      await db.insert(cobiaActivityEvents).values({
        ...input,
        wallet: normalizeAddress(input.wallet),
      }).onConflictDoNothing({ target: cobiaActivityEvents.id });
    },

    async listActivity(wallet: string, chainId: number) {
      return db.query.cobiaActivityEvents.findMany({
        where: and(
          eq(cobiaActivityEvents.wallet, normalizeAddress(wallet)),
          eq(cobiaActivityEvents.chainId, chainId),
        ),
        orderBy: [desc(cobiaActivityEvents.occurredAt)],
      });
    },
  };
}
