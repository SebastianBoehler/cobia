import type { Hash } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp,
  uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { cobiaChallengeRounds } from "./challenge-schema";
import { cobiaIntents } from "./intent-schema";
import { cobiaSolvers } from "./solver-schema";

export const solverSubmissionState = pgEnum("cobia_solver_submission_state", [
  "proposed", "rejected", "verified", "attested", "superseded", "executed", "failed",
]);

export const programArtifactKindV2 = pgEnum("cobia_program_artifact_kind_v2", [
  "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
  "receipt", "objective",
]);

export const cobiaSolverSubmissions = pgTable("cobia_solver_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  intentId: uuid("intent_id").references(() => cobiaIntents.id, { onDelete: "restrict" }),
  challengeRoundId: uuid("challenge_round_id")
    .references(() => cobiaChallengeRounds.id, { onDelete: "restrict" }),
  solverId: text("solver_id").notNull()
    .references(() => cobiaSolvers.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  state: solverSubmissionState("state").notNull().default("proposed"),
  programHash: text("program_hash").$type<Hash>().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  blockNumber: text("block_number").notNull(),
  blockHash: text("block_hash").$type<Hash>().notNull(),
  failureCodes: text("failure_codes").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("cobia_submissions_intent_revision_idx")
    .on(table.intentId, table.solverId, table.revision),
  uniqueIndex("cobia_submissions_round_revision_idx")
    .on(table.challengeRoundId, table.solverId, table.revision),
  index("cobia_submissions_intent_state_idx").on(table.intentId, table.state, table.validUntil),
  index("cobia_submissions_round_state_idx")
    .on(table.challengeRoundId, table.state, table.validUntil),
  index("cobia_submissions_solver_idx").on(table.solverId, table.createdAt),
  check("cobia_submissions_parent_check", sql`
    ((${table.intentId} IS NOT NULL)::integer +
      (${table.challengeRoundId} IS NOT NULL)::integer) = 1
  `),
  check("cobia_submissions_identity_check", sql`
    ${table.revision} BETWEEN 1 AND 20
    AND ${table.programHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.blockNumber} ~ '^[1-9][0-9]*$'
    AND ${table.blockHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.validUntil} > ${table.createdAt}
  `),
  check("cobia_submissions_failure_check", sql`
    ((${table.state} IN ('rejected', 'failed')) =
      (cardinality(${table.failureCodes}) > 0))
    AND (${table.challengeRoundId} IS NULL OR
      ${table.state} NOT IN ('attested', 'executed'))
  `),
]);

export const cobiaProgramArtifactsV2 = pgTable("cobia_program_artifacts_v2", {
  id: serial("id").primaryKey(),
  submissionId: uuid("submission_id").notNull()
    .references(() => cobiaSolverSubmissions.id, { onDelete: "restrict" }),
  kind: programArtifactKindV2("kind").notNull(),
  artifactHash: text("artifact_hash").$type<Hash>().notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_program_artifacts_v2_kind_idx").on(table.submissionId, table.kind),
  check("cobia_program_artifacts_v2_hash_check", sql`
    ${table.artifactHash} ~ '^0x[0-9a-f]{64}$'
  `),
]);
