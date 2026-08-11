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
import { cobiaExecutionRehearsals, cobiaRoutePurchases } from "./route-schema";

export const executionAttemptState = pgEnum("cobia_execution_attempt_state", [
  "prepared",
  "active",
  "partial",
  "reconcile",
  "failed",
  "complete",
]);

export const executionStepState = pgEnum("cobia_execution_step_state", [
  "prepared",
  "submitted",
  "confirmed",
  "reconcile",
  "failed",
]);

export const cobiaExecutionAttempts = pgTable(
  "cobia_execution_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: text("route_id").notNull()
      .references(() => cobiaRoutePurchases.id, { onDelete: "restrict" }),
    rehearsalId: uuid("rehearsal_id").notNull()
      .references(() => cobiaExecutionRehearsals.id, { onDelete: "restrict" }),
    rehearsalTraceHash: text("rehearsal_trace_hash").notNull(),
    bundleHash: text("bundle_hash").notNull(),
    buyer: text("buyer").notNull(),
    executionChainId: integer("execution_chain_id").notNull(),
    state: executionAttemptState("state").notNull().default("prepared"),
    proofHash: text("proof_hash").notNull(),
    proofNonce: text("proof_nonce").notNull(),
    proofExpiresAt: timestamp("proof_expires_at", { withTimezone: true }).notNull(),
    nextOrdinal: integer("next_ordinal").notNull().default(0),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("cobia_execution_attempts_route_idx").on(table.routeId),
    uniqueIndex("cobia_execution_attempts_rehearsal_idx").on(table.rehearsalId),
    uniqueIndex("cobia_execution_attempts_proof_idx").on(table.proofHash),
    uniqueIndex("cobia_execution_attempts_nonce_idx").on(table.proofNonce),
    index("cobia_execution_attempts_buyer_idx").on(table.buyer, table.updatedAt),
    check("cobia_execution_attempts_identity_check", sql`
      ${table.executionChainId} = 196
      AND ${table.routeId} = lower(${table.routeId})
      AND ${table.routeId} = ${table.bundleHash}
      AND ${table.buyer} = lower(${table.buyer})
      AND ${table.rehearsalTraceHash} = lower(${table.rehearsalTraceHash})
      AND ${table.proofHash} = lower(${table.proofHash})
      AND ${table.proofNonce} = lower(${table.proofNonce})
      AND ${table.nextOrdinal} >= 0
    `),
    check("cobia_execution_attempts_state_check", sql`
      (${table.state} IN ('prepared', 'active', 'partial', 'reconcile')
        AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL)
      OR (${table.state} = 'failed'
        AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)
      OR (${table.state} = 'complete'
        AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL)
    `),
  ],
);

export const cobiaExecutionSteps = pgTable(
  "cobia_execution_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull()
      .references(() => cobiaExecutionAttempts.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    kind: text("kind").notNull(),
    state: executionStepState("state").notNull().default("prepared"),
    from: text("from_address").notNull(),
    to: text("to_address").notNull(),
    valueAtomic: text("value_atomic").notNull(),
    calldata: text("calldata").notNull(),
    calldataHash: text("calldata_hash").notNull(),
    semantic: jsonb("semantic").$type<Record<string, unknown>>().notNull(),
    preBlockNumber: text("pre_block_number").notNull(),
    preBlockHash: text("pre_block_hash").notNull(),
    expectedNonce: text("expected_nonce").notNull(),
    gasEstimateAtomic: text("gas_estimate_atomic").notNull(),
    transactionHash: text("transaction_hash"),
    receipt: jsonb("receipt").$type<Record<string, unknown>>(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    postcondition: jsonb("postcondition").$type<Record<string, unknown>>(),
    failureCode: text("failure_code"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cobia_execution_steps_ordinal_idx").on(table.attemptId, table.ordinal),
    uniqueIndex("cobia_execution_steps_transaction_idx").on(table.transactionHash),
    index("cobia_execution_steps_attempt_idx").on(table.attemptId, table.state),
    check("cobia_execution_steps_identity_check", sql`
      ${table.ordinal} >= 0
      AND ${table.kind} IN ('approval', 'swap', 'supply')
      AND ${table.from} = lower(${table.from})
      AND ${table.to} = lower(${table.to})
      AND ${table.valueAtomic} ~ '^(0|[1-9][0-9]*)$'
      AND ${table.preBlockNumber} ~ '^(0|[1-9][0-9]*)$'
      AND ${table.expectedNonce} ~ '^(0|[1-9][0-9]*)$'
      AND ${table.gasEstimateAtomic} ~ '^(0|[1-9][0-9]*)$'
      AND ${table.calldata} = lower(${table.calldata})
      AND ${table.calldataHash} = lower(${table.calldataHash})
      AND ${table.preBlockHash} = lower(${table.preBlockHash})
    `),
    check("cobia_execution_steps_state_check", sql`
      (${table.state} = 'prepared'
        AND ${table.transactionHash} IS NULL AND ${table.submittedAt} IS NULL
        AND ${table.receipt} IS NULL AND ${table.evidence} IS NULL
        AND ${table.postcondition} IS NULL AND ${table.failureCode} IS NULL
        AND ${table.resolvedAt} IS NULL)
      OR (${table.state} = 'submitted'
        AND ${table.transactionHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL
        AND ${table.receipt} IS NULL AND ${table.evidence} IS NULL
        AND ${table.postcondition} IS NULL AND ${table.failureCode} IS NULL
        AND ${table.resolvedAt} IS NULL)
      OR (${table.state} = 'confirmed'
        AND ${table.transactionHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL
        AND ${table.receipt} IS NOT NULL AND ${table.evidence} IS NOT NULL
        AND ${table.postcondition} IS NOT NULL AND ${table.failureCode} IS NULL
        AND ${table.resolvedAt} IS NOT NULL)
      OR (${table.state} = 'reconcile'
        AND ${table.transactionHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL
        AND ${table.receipt} IS NULL AND ${table.evidence} IS NULL
        AND ${table.postcondition} IS NULL AND ${table.failureCode} IS NOT NULL
        AND ${table.resolvedAt} IS NULL)
      OR (${table.state} = 'failed'
        AND ${table.receipt} IS NULL AND ${table.evidence} IS NULL
        AND ${table.postcondition} IS NULL AND ${table.failureCode} IS NOT NULL
        AND ${table.resolvedAt} IS NOT NULL)
    `),
  ],
);
