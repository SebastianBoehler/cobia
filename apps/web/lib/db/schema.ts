import type {
  PersistedBundle,
  PersistedRouteQuote,
  PersistedSnapshot,
  PersistedStablecoinPolicy,
  PersistedVerificationVerdict,
} from "@cobia/domain";
import type { EvmPaymentReceipt } from "../payments/receipt";
import type { PaymentTerms } from "../payments/terms";
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
    marketId: text("market_id")
      .notNull()
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
    requestId: uuid("request_id")
      .notNull()
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

export const paymentState = pgEnum("cobia_payment_state", [
  "pending",
  "settled",
  "finalized",
]);

export const cobiaPayments = pgTable(
  "cobia_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull()
      .references(() => cobiaRequests.id, { onDelete: "restrict" }),
    quoteId: text("quote_id").notNull()
      .references(() => cobiaQuotes.id, { onDelete: "restrict" }),
    state: paymentState("state").notNull().default("pending"),
    payer: text("payer").notNull(),
    paymentChainId: integer("payment_chain_id").notNull(),
    executionChainId: integer("execution_chain_id").notNull(),
    realm: text("realm").notNull(),
    currency: text("currency").notNull(),
    decimals: integer("decimals").notNull(),
    amountAtomic: text("amount_atomic").notNull(),
    recipient: text("recipient").notNull(),
    feePayer: boolean("fee_payer").notNull(),
    splits: jsonb("splits").$type<PaymentTerms["splits"]>().notNull(),
    externalId: text("external_id").notNull(),
    paymentTerms: jsonb("payment_terms").$type<PaymentTerms>().notNull(),
    paymentTermsHash: text("payment_terms_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revealProofHash: text("reveal_proof_hash").notNull(),
    revealNonce: text("reveal_nonce").notNull(),
    proofExpiresAt: timestamp("proof_expires_at", { withTimezone: true }).notNull(),
    challengeId: text("challenge_id"),
    credentialHash: text("credential_hash"),
    authorizationValidAfter: timestamp("authorization_valid_after", { withTimezone: true }),
    receiptHeader: text("receipt_header"),
    receiptHash: text("receipt_hash"),
    receiptPayload: jsonb("receipt_payload").$type<EvmPaymentReceipt>(),
    receiptMethod: text("receipt_method"),
    receiptStatus: text("receipt_status"),
    receiptReference: text("receipt_reference"),
    receiptTimestamp: timestamp("receipt_timestamp", { withTimezone: true }),
    receiptChainId: integer("receipt_chain_id"),
    receiptChallengeId: text("receipt_challenge_id"),
    receiptExternalId: text("receipt_external_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cobia_payments_request_idx").on(table.requestId),
    uniqueIndex("cobia_payments_quote_idx").on(table.quoteId),
    uniqueIndex("cobia_payments_external_id_idx").on(table.externalId),
    uniqueIndex("cobia_payments_proof_idx").on(table.revealProofHash),
    uniqueIndex("cobia_payments_nonce_idx").on(table.revealNonce),
    uniqueIndex("cobia_payments_challenge_idx").on(table.challengeId),
    uniqueIndex("cobia_payments_credential_idx").on(table.credentialHash),
    uniqueIndex("cobia_payments_receipt_idx").on(table.receiptHash),
    uniqueIndex("cobia_payments_reference_idx").on(table.receiptReference),
    check("cobia_payments_support_check", sql`
      ${table.paymentChainId} = 1952 AND ${table.executionChainId} = 196
      AND ${table.decimals} = 6 AND ${table.amountAtomic} = '100000'
      AND ${table.feePayer} = true
    `),
    check("cobia_payments_credential_window_check", sql`
      (${table.credentialHash} IS NULL AND ${table.authorizationValidAfter} IS NULL)
      OR (${table.credentialHash} IS NOT NULL AND ${table.authorizationValidAfter} IS NOT NULL
        AND ${table.challengeId} IS NOT NULL
        AND ${table.authorizationValidAfter} < ${table.expiresAt})
    `),
    check("cobia_payments_receipt_state_check", sql`
      (${table.state} = 'pending' AND ${table.receiptHeader} IS NULL
        AND ${table.receiptHash} IS NULL AND ${table.receiptPayload} IS NULL
        AND ${table.receiptMethod} IS NULL AND ${table.receiptStatus} IS NULL
        AND ${table.receiptReference} IS NULL AND ${table.receiptTimestamp} IS NULL
        AND ${table.receiptChainId} IS NULL AND ${table.receiptChallengeId} IS NULL
        AND ${table.receiptExternalId} IS NULL AND ${table.settledAt} IS NULL)
      OR (${table.state} IN ('settled', 'finalized')
        AND ${table.challengeId} IS NOT NULL AND ${table.credentialHash} IS NOT NULL
        AND ${table.authorizationValidAfter} IS NOT NULL
        AND ${table.receiptHeader} IS NOT NULL AND ${table.receiptHash} IS NOT NULL
        AND ${table.receiptPayload} IS NOT NULL AND ${table.receiptMethod} = 'evm'
        AND ${table.receiptStatus} = 'success' AND ${table.receiptReference} IS NOT NULL
        AND ${table.receiptTimestamp} IS NOT NULL
        AND ${table.receiptTimestamp} >= ${table.issuedAt}
        AND ${table.receiptTimestamp} >= ${table.authorizationValidAfter}
        AND ${table.receiptTimestamp} < ${table.expiresAt}
        AND ${table.receiptChainId} IS NOT NULL
        AND ${table.receiptChainId} = ${table.paymentChainId}
        AND ${table.receiptChallengeId} IS NOT NULL
        AND ${table.receiptChallengeId} = ${table.challengeId}
        AND ${table.receiptExternalId} IS NOT NULL
        AND lower(${table.receiptExternalId}) = lower(${table.externalId})
        AND ${table.settledAt} IS NOT NULL)
    `),
    check("cobia_payments_finalized_state_check", sql`
      (${table.state} = 'finalized') = (${table.finalizedAt} IS NOT NULL)
    `),
  ],
);

export const cobiaRoutePurchases = pgTable(
  "cobia_route_purchases",
  {
    id: text("id").primaryKey(),
    requestId: uuid("request_id")
      .notNull()
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

export const cobiaSchema = {
  cobiaMarkets,
  cobiaRequests,
  cobiaQuotes,
  cobiaPayments,
  cobiaRoutePurchases,
  cobiaActivityEvents,
  requestState,
  paymentState,
};

export type CobiaRequestState = (typeof requestState.enumValues)[number];
export type CobiaPaymentState = (typeof paymentState.enumValues)[number];
