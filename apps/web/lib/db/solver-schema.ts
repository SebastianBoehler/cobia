import type { Address } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, jsonb, pgEnum, pgTable, text, timestamp,
} from "drizzle-orm/pg-core";

export const solverOperatorKind = pgEnum("cobia_solver_operator_kind", [
  "internal", "community",
]);

export const cobiaSolvers = pgTable("cobia_solvers", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  operatorKind: solverOperatorKind("operator_kind").notNull(),
  attestationAddress: text("attestation_address").$type<Address>(),
  declaredCapabilities: jsonb("declared_capabilities").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cobia_solvers_kind_idx").on(table.operatorKind, table.createdAt),
  check("cobia_solvers_identity_check", sql`
    ${table.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length(btrim(${table.displayName})) BETWEEN 1 AND 80
    AND jsonb_typeof(${table.declaredCapabilities}) = 'array'
    AND (${table.operatorKind} = 'internal' OR
      (${table.attestationAddress} IS NOT NULL AND
        ${table.attestationAddress} ~ '^0x[0-9a-f]{40}$'))
  `),
]);
