import type {
  PersistedBundle,
  PersistedRouteQuote,
  PersistedSnapshot,
  PersistedStablecoinPolicy,
  PersistedVerificationVerdict,
} from "@cobia/domain";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const requestState = pgEnum("cobia_request_state", [
  "open",
  "collecting",
  "verifying",
  "quotes_ready",
  "agent_ready",
  "partial",
  "selected",
  "payment_pending",
  "paid",
  "revealed",
  "executed",
  "failed",
]);

export const cobiaMarkets = pgTable(
  "cobia_markets",
  {
    id: text("id").primaryKey(),
    executionChainId: integer("execution_chain_id").notNull(),
    asset: text("asset").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cobia_markets_chain_asset_idx").on(table.executionChainId, table.asset),
    check("cobia_markets_identity_check", sql`
      ${table.executionChainId} = 196
      AND ${table.asset} ~ '^0x[0-9a-f]{40}$'
      AND ${table.id} = concat(${table.executionChainId}, ':', ${table.asset})
    `),
  ],
);

export const cobiaRequests = pgTable(
  "cobia_requests",
  {
    id: uuid("id").primaryKey(),
    marketId: text("market_id").notNull()
      .references(() => cobiaMarkets.id, { onDelete: "restrict" }),
    policyHash: text("policy_hash").notNull(),
    policy: jsonb("policy").$type<PersistedStablecoinPolicy>().notNull(),
    snapshot: jsonb("snapshot").$type<PersistedSnapshot>(),
    state: requestState("state").notNull().default("open"),
    selectedQuoteId: text("selected_quote_id"),
    paymentReceiptHash: text("payment_receipt_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cobia_requests_market_idx").on(table.marketId, table.createdAt),
    uniqueIndex("cobia_requests_policy_hash_idx").on(table.policyHash),
    uniqueIndex("cobia_requests_payment_receipt_idx").on(table.paymentReceiptHash),
    check("cobia_requests_market_identity_check", sql`
      ${table.marketId} = concat(
        (${table.policy}->>'executionChainId')::integer,
        ':',
        lower(${table.policy}->>'asset')
      )
    `),
  ],
);

export const cobiaQuotes = pgTable(
  "cobia_quotes",
  {
    id: text("id").primaryKey(),
    requestId: uuid("request_id").notNull()
      .references(() => cobiaRequests.id, { onDelete: "cascade" }),
    solverId: text("solver_id").notNull(),
    privateBundle: jsonb("private_bundle").$type<PersistedBundle>().notNull(),
    verdict: jsonb("verdict").$type<PersistedVerificationVerdict>().notNull(),
    publicQuote: jsonb("public_quote").$type<PersistedRouteQuote>().notNull(),
    executable: boolean("executable").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cobia_quotes_request_idx").on(table.requestId),
    uniqueIndex("cobia_quotes_request_solver_idx").on(table.requestId, table.solverId),
  ],
);
