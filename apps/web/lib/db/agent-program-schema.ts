import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cobiaRequests } from "./request-schema";

export const agentProgramState = pgEnum("cobia_agent_program_state", [
  "queued", "running", "rejected", "verified", "attested", "failed",
]);

export const agentArtifactKind = pgEnum("cobia_agent_artifact_kind", [
  "program", "evidence", "provenance", "verdict", "replay", "execution", "authorization",
]);

export const cobiaAgentPrograms = pgTable("cobia_agent_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull()
    .references(() => cobiaRequests.id, { onDelete: "restrict" }),
  owner: text("owner").notNull(),
  chainId: integer("chain_id").notNull(),
  policyHash: text("policy_hash").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  manifestHash: text("manifest_hash").notNull(),
  blockNumber: text("block_number").notNull(),
  blockHash: text("block_hash").notNull(),
  state: agentProgramState("state").notNull().default("queued"),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("cobia_agent_programs_request_idx").on(table.requestId),
  index("cobia_agent_programs_owner_idx").on(table.owner, table.updatedAt),
  check("cobia_agent_programs_identity_check", sql`
    ${table.chainId} = 196
    AND ${table.owner} = lower(${table.owner})
    AND ${table.blockNumber} ~ '^[1-9][0-9]*$'
    AND ${table.policyHash} = lower(${table.policyHash})
    AND ${table.snapshotHash} = lower(${table.snapshotHash})
    AND ${table.manifestHash} = lower(${table.manifestHash})
    AND ${table.blockHash} = lower(${table.blockHash})
  `),
  check("cobia_agent_programs_state_check", sql`
    (${table.state} IN ('queued', 'running', 'verified')
      AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'attested'
      AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} IN ('rejected', 'failed')
      AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)
  `),
]);

export const cobiaAgentArtifacts = pgTable("cobia_agent_artifacts", {
  id: serial("id").primaryKey(),
  programId: uuid("program_id").notNull()
    .references(() => cobiaAgentPrograms.id, { onDelete: "restrict" }),
  kind: agentArtifactKind("kind").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_agent_artifacts_kind_idx").on(table.programId, table.kind),
  check("cobia_agent_artifacts_hash_check", sql`${table.artifactHash} = lower(${table.artifactHash})`),
]);
