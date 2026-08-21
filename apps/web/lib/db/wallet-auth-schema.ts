import type { Address } from "viem";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const walletCompileState = pgEnum("cobia_wallet_compile_state", [
  "pending", "completed", "failed",
]);

export const cobiaWalletAuthChallenges = pgTable("cobia_wallet_auth_challenges", {
  nonceHash: text("nonce_hash").primaryKey(),
  owner: text("owner").$type<Address>().notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("cobia_wallet_auth_challenge_check", sql`
    ${table.nonceHash} ~ '^[0-9a-f]{64}$'
    AND ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND (${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt})
  `),
]);

export const cobiaWalletAuthSessions = pgTable("cobia_wallet_auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  owner: text("owner").$type<Address>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cobia_wallet_auth_sessions_owner_idx").on(table.owner, table.expiresAt),
  check("cobia_wallet_auth_session_check", sql`
    ${table.tokenHash} ~ '^[0-9a-f]{64}$'
    AND ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND ${table.expiresAt} > ${table.createdAt}
  `),
]);

export const cobiaIntentCompileAttempts = pgTable("cobia_intent_compile_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: text("owner").$type<Address>().notNull(),
  clientKey: text("client_key").notNull(),
  goalHash: text("goal_hash").notNull(),
  actionPreference: text("action_preference").notNull(),
  state: walletCompileState("state").notNull().default("pending"),
  result: jsonb("result").$type<unknown>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cobia_intent_compile_owner_idx").on(table.owner, table.createdAt),
  index("cobia_intent_compile_client_idx").on(table.clientKey, table.createdAt),
  index("cobia_intent_compile_cache_idx").on(table.owner, table.goalHash, table.completedAt),
  check("cobia_intent_compile_attempt_check", sql`
    ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND ${table.clientKey} ~ '^[0-9a-f]{64}$'
    AND ${table.goalHash} ~ '^[0-9a-f]{64}$'
    AND (
      (${table.state} = 'pending' AND ${table.result} IS NULL AND ${table.completedAt} IS NULL)
      OR (${table.state} = 'completed' AND ${table.result} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      OR (${table.state} = 'failed' AND ${table.result} IS NULL AND ${table.completedAt} IS NOT NULL)
    )
  `),
]);
