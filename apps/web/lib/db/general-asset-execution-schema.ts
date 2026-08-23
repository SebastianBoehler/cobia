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
import type { ObservedReceiptV4, ReceiptLogV4 } from "../execution-v4/receipt-reconciler";

export const generalAssetProgramState = pgEnum("cobia_general_asset_program_state", [
  "active", "reconciliation_required", "confirmed", "failed",
]);

export const generalAssetStageState = pgEnum("cobia_general_asset_stage_state", [
  "pending", "prepared", "broadcasting", "submitted", "finalized", "delivered",
  "confirmed", "reconciliation_required", "failed",
]);

export interface StoredBridgeDeliveryV4 {
  kind: "bridge";
  destinationChainId: 1 | 196;
  recipient: `0x${string}`;
  token: `0x${string}`;
  minimumAtomic: string;
}

export type StoredDeliveryV4 = StoredBridgeDeliveryV4 | { kind: "none" };

export const cobiaGeneralAssetPrograms = pgTable("cobia_general_asset_programs", {
  id: text("id").primaryKey(),
  canonicalProgramHash: text("canonical_program_hash").notNull(),
  owner: text("owner").notNull(),
  finalOutputChainId: integer("final_output_chain_id").notNull(),
  finalOutputToken: text("final_output_token").notNull(),
  finalOutputMinimumAtomic: text("final_output_minimum_atomic").notNull(),
  state: generalAssetProgramState("state").notNull().default("active"),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("cobia_general_asset_program_hash_idx").on(table.canonicalProgramHash),
  index("cobia_general_asset_program_owner_idx").on(table.owner, table.updatedAt),
  check("cobia_general_asset_program_identity_check", sql`
    ${table.id} = lower(${table.id}) AND ${table.canonicalProgramHash} = ${table.id}
    AND ${table.owner} = lower(${table.owner})
    AND ${table.finalOutputToken} = lower(${table.finalOutputToken})
    AND ${table.finalOutputChainId} IN (1, 196)
    AND ${table.finalOutputMinimumAtomic} ~ '^[1-9][0-9]*$'
  `),
  check("cobia_general_asset_program_state_check", sql`
    (${table.state} = 'active' AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NULL)
    OR (${table.state} = 'reconciliation_required' AND ${table.failureCode} IS NOT NULL
      AND ${table.completedAt} IS NULL)
    OR (${table.state} = 'confirmed' AND ${table.failureCode} IS NULL
      AND ${table.completedAt} IS NOT NULL)
    OR (${table.state} = 'failed' AND ${table.failureCode} IS NOT NULL
      AND ${table.completedAt} IS NOT NULL)
  `),
]);

export const cobiaGeneralAssetStages = pgTable("cobia_general_asset_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: text("program_id").notNull().references(
    () => cobiaGeneralAssetPrograms.id, { onDelete: "restrict" },
  ),
  stageId: text("stage_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  chainId: integer("chain_id").notNull(),
  predecessorStageId: text("predecessor_stage_id"),
  state: generalAssetStageState("state").notNull().default("pending"),
  sender: text("sender").notNull(),
  inputToken: text("input_token").notNull(),
  target: text("target").notNull(),
  valueAtomic: text("value_atomic").notNull(),
  calldata: text("calldata").notNull(),
  expectedNonce: text("expected_nonce").notNull(),
  requiredConfirmations: integer("required_confirmations").notNull(),
  expectedLogs: jsonb("expected_logs").$type<ReceiptLogV4[]>().notNull(),
  delivery: jsonb("delivery").$type<StoredDeliveryV4>().notNull(),
  transactionHash: text("transaction_hash"),
  failureCode: text("failure_code"),
  preparedAt: timestamp("prepared_at", { withTimezone: true }),
  armedAt: timestamp("armed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_general_asset_stage_identity_idx").on(table.programId, table.stageId),
  uniqueIndex("cobia_general_asset_stage_ordinal_idx").on(table.programId, table.ordinal),
  uniqueIndex("cobia_general_asset_stage_transaction_idx").on(table.transactionHash),
  index("cobia_general_asset_stage_state_idx").on(table.programId, table.state),
  check("cobia_general_asset_stage_identity_check", sql`
    ${table.stageId} = lower(${table.stageId}) AND ${table.ordinal} >= 0
    AND ${table.chainId} IN (1, 196) AND ${table.sender} = lower(${table.sender})
    AND ${table.inputToken} = lower(${table.inputToken})
    AND ${table.target} = lower(${table.target}) AND ${table.calldata} = lower(${table.calldata})
    AND ${table.valueAtomic} ~ '^(0|[1-9][0-9]*)$'
    AND ${table.expectedNonce} ~ '^(0|[1-9][0-9]*)$'
    AND ${table.requiredConfirmations} BETWEEN 1 AND 256
  `),
  check("cobia_general_asset_stage_state_check", sql`
    (${table.state} IN ('pending', 'prepared') AND ${table.transactionHash} IS NULL
      AND ${table.armedAt} IS NULL AND ${table.submittedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'broadcasting' AND ${table.transactionHash} IS NULL
      AND ${table.armedAt} IS NOT NULL AND ${table.submittedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'submitted' AND ${table.transactionHash} IS NOT NULL
      AND ${table.armedAt} IS NOT NULL AND ${table.submittedAt} IS NOT NULL
      AND ${table.finalizedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'finalized' AND ${table.transactionHash} IS NOT NULL
      AND ${table.finalizedAt} IS NOT NULL AND ${table.deliveredAt} IS NULL
      AND ${table.confirmedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'delivered' AND ${table.transactionHash} IS NOT NULL
      AND ${table.finalizedAt} IS NOT NULL AND ${table.deliveredAt} IS NOT NULL
      AND ${table.confirmedAt} IS NULL AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'confirmed' AND ${table.transactionHash} IS NOT NULL
      AND ${table.finalizedAt} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL
      AND ${table.failureCode} IS NULL)
    OR (${table.state} = 'reconciliation_required' AND ${table.failureCode} IS NOT NULL)
    OR (${table.state} = 'failed' AND ${table.failureCode} IS NOT NULL)
  `),
]);

export const cobiaGeneralAssetReceipts = pgTable("cobia_general_asset_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageRecordId: uuid("stage_record_id").notNull().references(
    () => cobiaGeneralAssetStages.id, { onDelete: "restrict" },
  ),
  transactionHash: text("transaction_hash").notNull(),
  receipt: jsonb("receipt").$type<ObservedReceiptV4>().notNull(),
  canonicalBlockHash: text("canonical_block_hash").notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_general_asset_receipt_stage_idx").on(table.stageRecordId),
  uniqueIndex("cobia_general_asset_receipt_transaction_idx").on(table.transactionHash),
  check("cobia_general_asset_receipt_identity_check", sql`
    ${table.transactionHash} = lower(${table.transactionHash})
    AND ${table.canonicalBlockHash} = lower(${table.canonicalBlockHash})
  `),
]);

export const cobiaGeneralAssetDeliveries = pgTable("cobia_general_asset_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageRecordId: uuid("stage_record_id").notNull().references(
    () => cobiaGeneralAssetStages.id, { onDelete: "restrict" },
  ),
  messageId: text("message_id").notNull(),
  sourceTransactionHash: text("source_transaction_hash").notNull(),
  destinationChainId: integer("destination_chain_id").notNull(),
  recipient: text("recipient").notNull(),
  token: text("token").notNull(),
  amountAtomic: text("amount_atomic").notNull(),
  deliveryTransactionHash: text("delivery_transaction_hash").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cobia_general_asset_delivery_stage_idx").on(table.stageRecordId),
  uniqueIndex("cobia_general_asset_delivery_message_idx").on(table.messageId),
  check("cobia_general_asset_delivery_identity_check", sql`
    ${table.messageId} = lower(${table.messageId})
    AND ${table.sourceTransactionHash} = lower(${table.sourceTransactionHash})
    AND ${table.deliveryTransactionHash} = lower(${table.deliveryTransactionHash})
    AND ${table.destinationChainId} IN (1, 196)
    AND ${table.recipient} = lower(${table.recipient}) AND ${table.token} = lower(${table.token})
    AND ${table.amountAtomic} ~ '^[1-9][0-9]*$'
  `),
]);
