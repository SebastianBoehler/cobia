import type { Hash } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { cobiaIntents } from "./intent-schema";
import { cobiaSolvers } from "./solver-schema";

export const solverRunState = pgEnum("cobia_solver_run_state", [
  "queued", "running", "completed", "abstained", "failed",
]);

export const cobiaSolverRuns = pgTable("cobia_solver_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  intentId: uuid("intent_id").notNull()
    .references(() => cobiaIntents.id, { onDelete: "restrict" }),
  solverId: text("solver_id").notNull()
    .references(() => cobiaSolvers.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  state: solverRunState("state").notNull().default("queued"),
  blockNumber: text("block_number").notNull(),
  blockHash: text("block_hash").$type<Hash>().notNull(),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("cobia_solver_runs_revision_idx")
    .on(table.intentId, table.solverId, table.revision),
  index("cobia_solver_runs_state_idx").on(table.state, table.updatedAt),
  check("cobia_solver_runs_identity_check", sql`
    ${table.revision} BETWEEN 1 AND 20
    AND ${table.blockNumber} ~ '^[1-9][0-9]*$'
    AND ${table.blockHash} ~ '^0x[0-9a-f]{64}$'
  `),
  check("cobia_solver_runs_state_check", sql`
    (${table.state} IN ('queued', 'running')
      AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'completed'
      AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'abstained'
      AND ${table.completedAt} IS NOT NULL
      AND (${table.failureCode} IS NULL
        OR ${table.failureCode} ~ '^[A-Z][A-Z0-9_]{2,63}$'))
    OR (${table.state} = 'failed'
      AND ${table.completedAt} IS NOT NULL
      AND ${table.failureCode} ~ '^[A-Z][A-Z0-9_]{2,63}$')
  `),
]);
