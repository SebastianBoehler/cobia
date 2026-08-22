import type {
  CapabilityCompositionSnapshotV1,
  OpenIntentSnapshotV1,
  SolverDecisionClaimV1,
} from "@cobia/domain";
import type { Address, Hash, Hex } from "viem";
import { sql } from "drizzle-orm";
import { check, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { cobiaIntents } from "./intent-schema";
import { cobiaSolverSubmissions } from "./program-schema-v2";
import { cobiaSolvers } from "./solver-schema";

export const cobiaOpenIntentSnapshots = pgTable("cobia_open_intent_snapshots", {
  intentId: uuid("intent_id").primaryKey()
    .references(() => cobiaIntents.id, { onDelete: "restrict" }),
  snapshotHash: text("snapshot_hash").$type<Hash>().notNull(),
  snapshot: jsonb("snapshot").$type<
    OpenIntentSnapshotV1 | CapabilityCompositionSnapshotV1
  >().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_open_snapshots_hash_idx").on(table.snapshotHash),
  check("cobia_open_snapshots_identity_check", sql`
    ${table.snapshotHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.snapshot}->>'requestId' = ${table.intentId}::text
    AND (${table.snapshot}->>'version')::integer = 1
    AND ${table.snapshot}->>'kind' IN ('open-onchain', 'capability-composition')
  `),
]);

export const cobiaSolverDecisionClaims = pgTable("cobia_solver_decision_claims", {
  nonce: text("nonce").$type<Hash>().primaryKey(),
  claimHash: text("claim_hash").$type<Hash>().notNull(),
  intentId: uuid("intent_id").notNull()
    .references(() => cobiaIntents.id, { onDelete: "restrict" }),
  solverId: text("solver_id").notNull()
    .references(() => cobiaSolvers.id, { onDelete: "restrict" }),
  claim: jsonb("claim").$type<SolverDecisionClaimV1>().notNull(),
  signature: text("signature").$type<Hex>().notNull(),
  decision: jsonb("decision").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_solver_decision_claim_hash_idx").on(table.claimHash),
  uniqueIndex("cobia_solver_decision_revision_idx")
    .on(table.intentId, table.solverId, sql`((${table.claim}->>'revision')::integer)`),
  check("cobia_solver_decision_claim_check", sql`
    ${table.nonce} ~ '^0x[0-9a-f]{64}$'
    AND ${table.claimHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.signature} ~ '^0x[0-9a-fA-F]{130}$'
    AND ${table.claim}->>'intentId' = ${table.intentId}::text
    AND ${table.claim}->>'solverId' = ${table.solverId}
    AND lower(${table.claim}->>'nonce') = ${table.nonce}
  `),
]);

export const solverSuccessFeeState = pgEnum("cobia_solver_success_fee_state", [
  "authorized", "settling", "settled", "uncertain", "expired",
]);

export const cobiaSolverSuccessFees = pgTable("cobia_solver_success_fees", {
  submissionId: uuid("submission_id").primaryKey()
    .references(() => cobiaSolverSubmissions.id, { onDelete: "restrict" }),
  solverId: text("solver_id").notNull()
    .references(() => cobiaSolvers.id, { onDelete: "restrict" }),
  owner: text("owner").$type<Address>().notNull(),
  recipient: text("recipient").$type<Address>().notNull(),
  amountAtomic: text("amount_atomic").notNull(),
  termsHash: text("terms_hash").$type<Hash>().notNull(),
  terms: jsonb("terms").$type<unknown>().notNull(),
  credentialHash: text("credential_hash").$type<Hash>().notNull(),
  credential: jsonb("credential").$type<unknown>().notNull(),
  state: solverSuccessFeeState("state").notNull().default("authorized"),
  settlement: jsonb("settlement").$type<unknown>(),
  errorCode: text("error_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("cobia_solver_success_fee_credential_idx").on(table.credentialHash),
  check("cobia_solver_success_fee_check", sql`
    ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND ${table.recipient} ~ '^0x[0-9a-f]{40}$'
    AND ${table.amountAtomic} ~ '^[1-9][0-9]*$'
    AND ${table.termsHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.credentialHash} ~ '^0x[0-9a-f]{64}$'
    AND ((${table.state} = 'settled') = (${table.settlement} IS NOT NULL))
  `),
]);
