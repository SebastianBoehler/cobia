CREATE TYPE "public"."cobia_general_asset_program_state" AS ENUM('active', 'reconciliation_required', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cobia_general_asset_stage_state" AS ENUM('pending', 'prepared', 'broadcasting', 'submitted', 'finalized', 'delivered', 'confirmed', 'reconciliation_required', 'failed');--> statement-breakpoint
CREATE TABLE "cobia_general_asset_programs" (
  "id" text PRIMARY KEY NOT NULL,
  "canonical_program_hash" text NOT NULL,
  "owner" text NOT NULL,
  "final_output_chain_id" integer NOT NULL,
  "final_output_token" text NOT NULL,
  "final_output_minimum_atomic" text NOT NULL,
  "state" "cobia_general_asset_program_state" DEFAULT 'active' NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "cobia_general_asset_program_identity_check" CHECK (
    "id" = lower("id") AND "canonical_program_hash" = "id"
    AND "owner" = lower("owner") AND "final_output_token" = lower("final_output_token")
    AND "final_output_chain_id" IN (1, 196)
    AND "final_output_minimum_atomic" ~ '^[1-9][0-9]*$'
  ),
  CONSTRAINT "cobia_general_asset_program_state_check" CHECK (
    ("state" = 'active' AND "failure_code" IS NULL AND "completed_at" IS NULL)
    OR ("state" = 'reconciliation_required' AND "failure_code" IS NOT NULL AND "completed_at" IS NULL)
    OR ("state" = 'confirmed' AND "failure_code" IS NULL AND "completed_at" IS NOT NULL)
    OR ("state" = 'failed' AND "failure_code" IS NOT NULL AND "completed_at" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE TABLE "cobia_general_asset_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "program_id" text NOT NULL,
  "stage_id" text NOT NULL,
  "ordinal" integer NOT NULL,
  "chain_id" integer NOT NULL,
  "predecessor_stage_id" text,
  "state" "cobia_general_asset_stage_state" DEFAULT 'pending' NOT NULL,
  "sender" text NOT NULL,
  "input_token" text NOT NULL,
  "target" text NOT NULL,
  "value_atomic" text NOT NULL,
  "calldata" text NOT NULL,
  "expected_nonce" text NOT NULL,
  "required_confirmations" integer NOT NULL,
  "expected_logs" jsonb NOT NULL,
  "delivery" jsonb NOT NULL,
  "transaction_hash" text,
  "failure_code" text,
  "prepared_at" timestamp with time zone,
  "armed_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "finalized_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_general_asset_stage_identity_check" CHECK (
    "stage_id" = lower("stage_id") AND "ordinal" >= 0 AND "chain_id" IN (1, 196)
    AND "sender" = lower("sender") AND "input_token" = lower("input_token")
    AND "target" = lower("target")
    AND "calldata" = lower("calldata") AND "value_atomic" ~ '^(0|[1-9][0-9]*)$'
    AND "expected_nonce" ~ '^(0|[1-9][0-9]*)$'
    AND "required_confirmations" BETWEEN 1 AND 256
  ),
  CONSTRAINT "cobia_general_asset_stage_state_check" CHECK (
    ("state" IN ('pending', 'prepared') AND "transaction_hash" IS NULL
      AND "armed_at" IS NULL AND "submitted_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'broadcasting' AND "transaction_hash" IS NULL
      AND "armed_at" IS NOT NULL AND "submitted_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'submitted' AND "transaction_hash" IS NOT NULL
      AND "armed_at" IS NOT NULL AND "submitted_at" IS NOT NULL
      AND "finalized_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'finalized' AND "transaction_hash" IS NOT NULL
      AND "finalized_at" IS NOT NULL AND "delivered_at" IS NULL
      AND "confirmed_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'delivered' AND "transaction_hash" IS NOT NULL
      AND "finalized_at" IS NOT NULL AND "delivered_at" IS NOT NULL
      AND "confirmed_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'confirmed' AND "transaction_hash" IS NOT NULL
      AND "finalized_at" IS NOT NULL AND "confirmed_at" IS NOT NULL AND "failure_code" IS NULL)
    OR ("state" = 'reconciliation_required' AND "failure_code" IS NOT NULL)
    OR ("state" = 'failed' AND "failure_code" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE TABLE "cobia_general_asset_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_record_id" uuid NOT NULL,
  "transaction_hash" text NOT NULL,
  "receipt" jsonb NOT NULL,
  "canonical_block_hash" text NOT NULL,
  "finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_general_asset_receipt_identity_check" CHECK (
    "transaction_hash" = lower("transaction_hash")
    AND "canonical_block_hash" = lower("canonical_block_hash")
  )
);--> statement-breakpoint
CREATE TABLE "cobia_general_asset_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stage_record_id" uuid NOT NULL,
  "message_id" text NOT NULL,
  "source_transaction_hash" text NOT NULL,
  "destination_chain_id" integer NOT NULL,
  "recipient" text NOT NULL,
  "token" text NOT NULL,
  "amount_atomic" text NOT NULL,
  "delivery_transaction_hash" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_general_asset_delivery_identity_check" CHECK (
    "message_id" = lower("message_id")
    AND "source_transaction_hash" = lower("source_transaction_hash")
    AND "delivery_transaction_hash" = lower("delivery_transaction_hash")
    AND "destination_chain_id" IN (1, 196)
    AND "recipient" = lower("recipient") AND "token" = lower("token")
    AND "amount_atomic" ~ '^[1-9][0-9]*$'
  )
);--> statement-breakpoint
ALTER TABLE "cobia_general_asset_stages" ADD CONSTRAINT "cobia_general_asset_stages_program_fk" FOREIGN KEY ("program_id") REFERENCES "public"."cobia_general_asset_programs"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cobia_general_asset_receipts" ADD CONSTRAINT "cobia_general_asset_receipts_stage_fk" FOREIGN KEY ("stage_record_id") REFERENCES "public"."cobia_general_asset_stages"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cobia_general_asset_deliveries" ADD CONSTRAINT "cobia_general_asset_deliveries_stage_fk" FOREIGN KEY ("stage_record_id") REFERENCES "public"."cobia_general_asset_stages"("id") ON DELETE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_program_hash_idx" ON "cobia_general_asset_programs" ("canonical_program_hash");--> statement-breakpoint
CREATE INDEX "cobia_general_asset_program_owner_idx" ON "cobia_general_asset_programs" ("owner", "updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_stage_identity_idx" ON "cobia_general_asset_stages" ("program_id", "stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_stage_ordinal_idx" ON "cobia_general_asset_stages" ("program_id", "ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_stage_transaction_idx" ON "cobia_general_asset_stages" ("transaction_hash");--> statement-breakpoint
CREATE INDEX "cobia_general_asset_stage_state_idx" ON "cobia_general_asset_stages" ("program_id", "state");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_receipt_stage_idx" ON "cobia_general_asset_receipts" ("stage_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_receipt_transaction_idx" ON "cobia_general_asset_receipts" ("transaction_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_delivery_stage_idx" ON "cobia_general_asset_deliveries" ("stage_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_general_asset_delivery_message_idx" ON "cobia_general_asset_deliveries" ("message_id");
