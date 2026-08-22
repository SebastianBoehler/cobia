import {
  CapabilityCompositionSnapshotV1Schema,
  OpenIntentSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaOpenIntentSnapshots } from "./schema";

const IntentIdSchema = z.string().uuid();

export function createOpenIntentSnapshotRepository(db: CobiaDatabase) {
  return {
    async create(value: unknown) {
      const snapshot = z.discriminatedUnion("kind", [
        OpenIntentSnapshotV1Schema,
        CapabilityCompositionSnapshotV1Schema,
      ]).parse(value);
      const snapshotHash = commitment(snapshot);
      return db.transaction(async (tx) => {
        const stored = await tx.query.cobiaOpenIntentSnapshots.findFirst({
          where: eq(cobiaOpenIntentSnapshots.intentId, snapshot.requestId),
        });
        if (stored) {
          if (stored.snapshotHash !== snapshotHash) throw new Error("Open intent snapshot conflicts");
          return stored;
        }
        const rows = await tx.insert(cobiaOpenIntentSnapshots).values({
          intentId: snapshot.requestId,
          snapshotHash,
          snapshot,
        }).returning();
        if (!rows[0]) throw new Error("Open intent snapshot was not stored");
        return rows[0];
      });
    },

    get(intentId: string) {
      return db.query.cobiaOpenIntentSnapshots.findFirst({
        where: eq(cobiaOpenIntentSnapshots.intentId, IntentIdSchema.parse(intentId)),
      });
    },
  };
}
