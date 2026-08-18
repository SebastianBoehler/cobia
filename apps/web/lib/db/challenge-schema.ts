import type { Hash } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

export interface ChallengePolicyTemplateV1 {
  version: 1;
  capabilityTemplateId: "aave-supply" | "exact-input-swap" | "round-trip";
  parameters: Record<string, string>;
}

export const challengeStatus = pgEnum("cobia_challenge_status", [
  "active", "paused", "retired",
]);

export const cobiaChallenges = pgTable("cobia_challenges", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  title: text("title").notNull(),
  displayGoal: text("display_goal").notNull(),
  policyTemplate: jsonb("policy_template").$type<ChallengePolicyTemplateV1>().notNull(),
  manifestHash: text("manifest_hash").$type<Hash>().notNull(),
  status: challengeStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cobia_challenges_status_idx").on(table.status, table.updatedAt),
  check("cobia_challenges_identity_check", sql`
    ${table.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND ${table.chainId} = 196
    AND length(btrim(${table.title})) BETWEEN 1 AND 120
    AND length(btrim(${table.displayGoal})) BETWEEN 1 AND 500
    AND jsonb_typeof(${table.policyTemplate}) = 'object'
    AND ${table.manifestHash} ~ '^0x[0-9a-f]{64}$'
  `),
]);

export const cobiaChallengeRounds = pgTable("cobia_challenge_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengeId: text("challenge_id").notNull()
    .references(() => cobiaChallenges.id, { onDelete: "restrict" }),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  anchorBlockNumber: text("anchor_block_number").notNull(),
  anchorBlockHash: text("anchor_block_hash").$type<Hash>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_challenge_rounds_open_idx").on(table.challengeId, table.opensAt),
  index("cobia_challenge_rounds_close_idx").on(table.challengeId, table.closesAt),
  check("cobia_challenge_rounds_bounds_check", sql`
    ${table.closesAt} > ${table.opensAt}
    AND ${table.closesAt} <= ${table.opensAt} + interval '1 hour'
    AND ${table.anchorBlockNumber} ~ '^[1-9][0-9]*$'
    AND ${table.anchorBlockHash} ~ '^0x[0-9a-f]{64}$'
  `),
]);
