import type { PersistedBundle } from "@cobia/domain";
import { sql } from "drizzle-orm";
import {
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
import { cobiaPayments } from "./payment-schema";
import { cobiaRequests } from "./request-schema";

export const cobiaRoutePurchases = pgTable(
  "cobia_route_purchases",
  {
    id: text("id").primaryKey(),
    requestId: uuid("request_id").notNull()
      .references(() => cobiaRequests.id, { onDelete: "cascade" }),
    quoteId: text("quote_id").notNull(),
    buyer: text("buyer").notNull(),
    executionChainId: integer("chain_id").notNull(),
    paymentChainId: integer("payment_chain_id"),
    paymentId: uuid("payment_id").references(() => cobiaPayments.id, { onDelete: "restrict" }),
    receiptHash: text("receipt_hash").notNull(),
    bundle: jsonb("bundle").$type<PersistedBundle>().notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cobia_route_purchases_quote_idx").on(table.quoteId),
    uniqueIndex("cobia_route_purchases_receipt_idx").on(table.receiptHash),
    uniqueIndex("cobia_route_purchases_payment_idx").on(table.paymentId),
    index("cobia_route_purchases_buyer_idx").on(table.buyer, table.executionChainId),
  ],
);

export const executionRehearsalState = pgEnum("cobia_execution_rehearsal_state", [
  "running",
  "passed",
  "failed",
]);

export const cobiaExecutionRehearsals = pgTable(
  "cobia_execution_rehearsals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: text("route_id").notNull()
      .references(() => cobiaRoutePurchases.id, { onDelete: "restrict" }),
    bundleHash: text("bundle_hash").notNull(),
    buyer: text("buyer").notNull(),
    executionChainId: integer("execution_chain_id").notNull(),
    state: executionRehearsalState("state").notNull().default("running"),
    proofHash: text("proof_hash").notNull(),
    proofNonce: text("proof_nonce").notNull(),
    proofExpiresAt: timestamp("proof_expires_at", { withTimezone: true }).notNull(),
    registryHash: text("registry_hash"),
    snapshotBlockHash: text("snapshot_block_hash"),
    engineVersion: text("engine_version"),
    traceHash: text("trace_hash"),
    trace: jsonb("trace").$type<Record<string, unknown>>(),
    failureCode: text("failure_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cobia_execution_rehearsals_route_idx").on(table.routeId, table.bundleHash),
    uniqueIndex("cobia_execution_rehearsals_proof_idx").on(table.proofHash),
    uniqueIndex("cobia_execution_rehearsals_nonce_idx").on(table.proofNonce),
    uniqueIndex("cobia_execution_rehearsals_trace_idx").on(table.traceHash),
    check("cobia_execution_rehearsals_identity_check", sql`
      ${table.executionChainId} = 196
      AND lower(${table.routeId}) = lower(${table.bundleHash})
    `),
    check("cobia_execution_rehearsals_state_check", sql`
      (${table.state} = 'running'
        AND ${table.registryHash} IS NULL AND ${table.snapshotBlockHash} IS NULL
        AND ${table.engineVersion} IS NULL AND ${table.traceHash} IS NULL
        AND ${table.trace} IS NULL AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NULL)
      OR (${table.state} = 'passed'
        AND ${table.registryHash} IS NOT NULL AND ${table.snapshotBlockHash} IS NOT NULL
        AND ${table.engineVersion} IS NOT NULL AND ${table.traceHash} IS NOT NULL
        AND ${table.trace} IS NOT NULL AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NOT NULL)
      OR (${table.state} = 'failed'
        AND ${table.registryHash} IS NULL AND ${table.snapshotBlockHash} IS NULL
        AND ${table.engineVersion} IS NULL AND ${table.traceHash} IS NULL
        AND ${table.trace} IS NULL AND ${table.failureCode} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL)
    `),
  ],
);

export const cobiaActivityEvents = pgTable(
  "cobia_activity_events",
  {
    id: uuid("id").primaryKey(),
    wallet: text("wallet").notNull(),
    executionChainId: integer("chain_id").notNull(),
    paymentId: uuid("payment_id").references(() => cobiaPayments.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    routeId: text("route_id"),
    transactionHash: text("transaction_hash"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("cobia_activity_events_wallet_idx").on(
      table.wallet,
      table.executionChainId,
      table.occurredAt,
    ),
    uniqueIndex("cobia_activity_events_payment_kind_idx").on(table.paymentId, table.kind),
  ],
);
