import type { Address, Hash } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, integer, pgEnum, pgTable, serial, text, timestamp,
  uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { cobiaCommerceOfferSnapshots } from "./commerce-schema";

export const commercePlacementState = pgEnum("cobia_commerce_placement_state", [
  "prepared", "authorizing", "submitted", "confirmed", "rejected",
]);

export const cobiaCommercePlacements = pgTable("cobia_commerce_placements", {
  id: uuid("id").primaryKey(),
  owner: text("owner").$type<Address>().notNull(),
  offerCommitment: text("offer_commitment").$type<Hash>().notNull()
    .references(() => cobiaCommerceOfferSnapshots.commitment, { onDelete: "restrict" }),
  policyHash: text("policy_hash").$type<Hash>().notNull(),
  programHash: text("program_hash").$type<Hash>().notNull(),
  manifestHash: text("manifest_hash").$type<Hash>().notNull(),
  planHash: text("plan_hash").$type<Hash>().notNull(),
  authorizationTemplateHash: text("authorization_template_hash").$type<Hash>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("cobia_commerce_placements_policy_idx").on(table.policyHash),
  index("cobia_commerce_placements_owner_idx").on(table.owner, table.createdAt),
  check("cobia_commerce_placements_identity_check", sql`
    ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND ${table.offerCommitment} ~ '^0x[0-9a-f]{64}$'
    AND ${table.policyHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.programHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.manifestHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.planHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.authorizationTemplateHash} ~ '^0x[0-9a-f]{64}$'
  `),
]);

export const cobiaCommercePlacementEvents = pgTable("cobia_commerce_placement_events", {
  id: serial("id").primaryKey(),
  placementId: uuid("placement_id").notNull()
    .references(() => cobiaCommercePlacements.id, { onDelete: "restrict" }),
  sequence: integer("sequence").notNull(),
  state: commercePlacementState("state").notNull(),
  authorizationHash: text("authorization_hash").$type<Hash>(),
  transactionHash: text("transaction_hash").$type<Hash>(),
  evidenceHash: text("evidence_hash").$type<Hash>(),
  rejectionCode: text("rejection_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("cobia_commerce_placement_events_sequence_idx").on(table.placementId, table.sequence),
  uniqueIndex("cobia_commerce_placement_events_authorization_idx").on(table.authorizationHash),
  index("cobia_commerce_placement_events_state_idx").on(table.state, table.createdAt),
  check("cobia_commerce_placement_events_payload_check", sql`
    (${table.state} = 'prepared' AND ${table.authorizationHash} IS NULL
      AND ${table.transactionHash} IS NULL AND ${table.evidenceHash} IS NULL
      AND ${table.rejectionCode} IS NULL)
    OR (${table.state} = 'authorizing' AND ${table.authorizationHash} IS NOT NULL
      AND ${table.transactionHash} IS NULL AND ${table.evidenceHash} IS NULL
      AND ${table.rejectionCode} IS NULL)
    OR (${table.state} = 'submitted' AND ${table.authorizationHash} IS NULL
      AND ${table.transactionHash} IS NOT NULL AND ${table.evidenceHash} IS NULL
      AND ${table.rejectionCode} IS NULL)
    OR (${table.state} = 'confirmed' AND ${table.authorizationHash} IS NULL
      AND ${table.transactionHash} IS NULL AND ${table.evidenceHash} IS NOT NULL
      AND ${table.rejectionCode} IS NULL)
    OR (${table.state} = 'rejected' AND ${table.authorizationHash} IS NULL
      AND ${table.transactionHash} IS NULL AND ${table.evidenceHash} IS NULL
      AND ${table.rejectionCode} ~ '^[A-Z][A-Z0-9_]{2,63}$')
  `),
]);
