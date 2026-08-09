import type {
  DecisionBundle,
  MarketSnapshot,
  RouteQuote,
  StablecoinPolicy,
  VerificationVerdict,
} from "@cobia/domain";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const requestState = pgEnum("cobia_request_state", [
  "open",
  "collecting",
  "verifying",
  "quotes_ready",
  "partial",
  "selected",
  "payment_pending",
  "paid",
  "revealed",
  "executed",
  "failed",
]);

export const cobiaRequests = pgTable(
  "cobia_requests",
  {
    id: uuid("id").primaryKey(),
    policyHash: text("policy_hash").notNull(),
    policy: jsonb("policy").$type<StablecoinPolicy>().notNull(),
    snapshot: jsonb("snapshot").$type<MarketSnapshot>(),
    state: requestState("state").notNull().default("open"),
    selectedQuoteId: text("selected_quote_id"),
    paymentReceiptHash: text("payment_receipt_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cobia_requests_policy_hash_idx").on(table.policyHash),
    uniqueIndex("cobia_requests_payment_receipt_idx").on(table.paymentReceiptHash),
    index("cobia_requests_owner_idx").on(table.id),
  ],
);

export const cobiaQuotes = pgTable(
  "cobia_quotes",
  {
    id: text("id").primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => cobiaRequests.id, { onDelete: "cascade" }),
    solverId: text("solver_id").notNull(),
    privateBundle: jsonb("private_bundle").$type<DecisionBundle>().notNull(),
    verdict: jsonb("verdict").$type<VerificationVerdict>().notNull(),
    publicQuote: jsonb("public_quote").$type<RouteQuote>().notNull(),
    executable: boolean("executable").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("cobia_quotes_request_idx").on(table.requestId),
    uniqueIndex("cobia_quotes_request_solver_idx").on(table.requestId, table.solverId),
  ],
);

export const cobiaSchema = { cobiaRequests, cobiaQuotes, requestState };

export type CobiaRequestState = (typeof requestState.enumValues)[number];
