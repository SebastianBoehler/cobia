import type { EvmPaymentReceipt } from "../payments/receipt";
import type { PaymentTerms } from "../payments/terms";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cobiaQuotes, cobiaRequests } from "./request-schema";

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
      ((${table.paymentChainId} = 196
          AND lower(${table.currency}) = '0x779ded0c9e1022225f8e0630b35a9b54be713736')
        OR (${table.paymentChainId} = 1952
          AND lower(${table.currency}) = '0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c'))
      AND ${table.executionChainId} = 196
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
