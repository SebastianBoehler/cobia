import type {
  CapabilityCompositionPolicyV1,
  GeneralIntentPolicyV2,
  OpenIntentPolicyV3,
} from "@cobia/domain";
import type { Address, Hash, Hex } from "viem";
import { sql } from "drizzle-orm";
import {
  check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

export const intentState = pgEnum("cobia_intent_state", [
  "signed", "collecting", "closed", "selected", "executed", "failed",
]);

export const cobiaIntents = pgTable("cobia_intents", {
  id: uuid("id").primaryKey(),
  owner: text("owner").$type<Address>().notNull(),
  chainId: integer("chain_id").notNull(),
  displayGoal: text("display_goal").notNull(),
  policyHash: text("policy_hash").$type<Hash>().notNull(),
  policy: jsonb("policy").$type<
    GeneralIntentPolicyV2 | OpenIntentPolicyV3 | CapabilityCompositionPolicyV1
  >().notNull(),
  ownerSignature: text("owner_signature").$type<Hex>().notNull(),
  state: intentState("state").notNull().default("signed"),
  competitionClosesAt: timestamp("competition_closes_at", { withTimezone: true }).notNull(),
  selectedSubmissionId: uuid("selected_submission_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_intents_policy_hash_idx").on(table.policyHash),
  index("cobia_intents_owner_idx").on(table.owner, table.createdAt),
  index("cobia_intents_state_idx").on(table.state, table.competitionClosesAt),
  check("cobia_intents_policy_check", sql`
    ${table.chainId} = 196
    AND ${table.owner} ~ '^0x[0-9a-f]{40}$'
    AND ${table.policyHash} ~ '^0x[0-9a-f]{64}$'
    AND ${table.ownerSignature} ~ '^0x[0-9a-fA-F]{130}$'
    AND length(btrim(${table.displayGoal})) BETWEEN 1 AND 1000
    AND (
      ((${table.policy}->>'version')::integer = 3
        AND ${table.policy}->>'kind' = 'open-onchain'
        AND ${table.policy}->'executionChainIds' @> '[196]'::jsonb)
      OR
      ((${table.policy}->>'version')::integer = 1
        AND ${table.policy}->>'kind' = 'capability-composition'
        AND (${table.policy}->>'executionChainId')::integer = 196)
    )
    AND ${table.policy}->>'requestId' = ${table.id}::text
    AND lower(${table.policy}->>'owner') = ${table.owner}
    AND ${table.policy}->>'displayGoal' = ${table.displayGoal}
    AND to_timestamp((${table.policy}->'competition'->>'closesAt')::bigint)
      = ${table.competitionClosesAt}
  `),
]);
