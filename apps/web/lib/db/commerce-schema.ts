import type { CommerceOfferV1 } from "@cobia/domain";
import type { Hash } from "viem";
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const cobiaCommerceOfferSnapshots = pgTable("cobia_commerce_offer_snapshots", {
  commitment: text("commitment").$type<Hash>().primaryKey(),
  offerId: text("offer_id").notNull(),
  sourceProtocol: text("source_protocol").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceResponseHash: text("source_response_hash").$type<Hash>().notNull(),
  chainId: integer("chain_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  eligibility: text("eligibility").notNull(),
  canonicalJson: jsonb("canonical_json").$type<CommerceOfferV1>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cobia_commerce_offers_expiry_idx").on(table.expiresAt, table.offerId),
  index("cobia_commerce_offers_source_idx").on(table.sourceProtocol, table.createdAt),
  check("cobia_commerce_offers_identity_check", sql`
    ${table.commitment} ~ '^0x[0-9a-f]{64}$'
    AND ${table.sourceResponseHash} ~ '^0x[0-9a-f]{64}$'
    AND length(btrim(${table.offerId})) BETWEEN 1 AND 256
    AND ${table.sourceProtocol} IN ('x402-v2', 'ucp-catalog')
    AND ${table.eligibility} IN ('executable', 'discovery-only', 'blocked')
    AND ${table.chainId} > 0
    AND jsonb_typeof(${table.canonicalJson}) = 'object'
  `),
]);
