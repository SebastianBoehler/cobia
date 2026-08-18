import {
  CommerceOfferV1Schema,
  canonicalJson,
  commerceOfferCommitmentV1,
  type CommerceOfferV1,
} from "@cobia/domain";
import { asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { CobiaDatabase } from "./client";
import { cobiaCommerceOfferSnapshots } from "./schema";

const CommitmentSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

export function createCommerceOfferRepository(db: CobiaDatabase) {
  return {
    async store(value: CommerceOfferV1) {
      const offer = CommerceOfferV1Schema.parse(value);
      const commitment = commerceOfferCommitmentV1(offer);
      await db.insert(cobiaCommerceOfferSnapshots).values({
        commitment,
        offerId: offer.offerId,
        sourceProtocol: offer.source.protocol,
        sourceUrl: offer.source.url,
        sourceResponseHash: offer.source.responseHash,
        chainId: offer.payment.chainId,
        expiresAt: new Date(offer.expiresAt * 1_000),
        eligibility: offer.eligibility.status,
        canonicalJson: offer,
      }).onConflictDoNothing({ target: cobiaCommerceOfferSnapshots.commitment });

      const stored = await db.query.cobiaCommerceOfferSnapshots.findFirst({
        where: eq(cobiaCommerceOfferSnapshots.commitment, commitment),
      });
      if (!stored) throw new Error("Commerce offer snapshot was not stored");
      const storedOffer = CommerceOfferV1Schema.parse(stored.canonicalJson);
      if (canonicalJson(storedOffer) !== canonicalJson(offer)) {
        throw new Error("Commerce offer commitment conflicts with stored snapshot");
      }
      return stored;
    },

    async get(value: string): Promise<CommerceOfferV1 | null> {
      const commitment = CommitmentSchema.parse(value) as `0x${string}`;
      const stored = await db.query.cobiaCommerceOfferSnapshots.findFirst({
        where: eq(cobiaCommerceOfferSnapshots.commitment, commitment),
      });
      return stored ? CommerceOfferV1Schema.parse(stored.canonicalJson) : null;
    },

    async listCurrent(observedAtSec: number, limit: number): Promise<CommerceOfferV1[]> {
      const observedAt = new Date(z.number().int().positive().safe().parse(observedAtSec) * 1_000);
      const boundedLimit = z.number().int().min(1).max(100).parse(limit);
      const rows = await db.query.cobiaCommerceOfferSnapshots.findMany({
        where: gt(cobiaCommerceOfferSnapshots.expiresAt, observedAt),
        orderBy: [asc(cobiaCommerceOfferSnapshots.offerId), asc(cobiaCommerceOfferSnapshots.commitment)],
        limit: boundedLimit,
      });
      return rows.map(({ canonicalJson: value }) => CommerceOfferV1Schema.parse(value));
    },
  };
}
