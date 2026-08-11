CREATE TYPE "public"."cobia_execution_attempt_state" AS ENUM('prepared', 'active', 'partial', 'reconcile', 'failed', 'complete');--> statement-breakpoint
CREATE TYPE "public"."cobia_execution_step_state" AS ENUM('prepared', 'submitted', 'confirmed', 'reconcile', 'failed');--> statement-breakpoint
CREATE TABLE "cobia_execution_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" text NOT NULL,
	"rehearsal_id" uuid NOT NULL,
	"rehearsal_trace_hash" text NOT NULL,
	"bundle_hash" text NOT NULL,
	"buyer" text NOT NULL,
	"execution_chain_id" integer NOT NULL,
	"state" "cobia_execution_attempt_state" DEFAULT 'prepared' NOT NULL,
	"proof_hash" text NOT NULL,
	"proof_nonce" text NOT NULL,
	"proof_expires_at" timestamp with time zone NOT NULL,
	"next_ordinal" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "cobia_execution_attempts_identity_check" CHECK (
      "cobia_execution_attempts"."execution_chain_id" = 196
      AND "cobia_execution_attempts"."route_id" = lower("cobia_execution_attempts"."route_id")
      AND "cobia_execution_attempts"."route_id" = "cobia_execution_attempts"."bundle_hash"
      AND "cobia_execution_attempts"."buyer" = lower("cobia_execution_attempts"."buyer")
      AND "cobia_execution_attempts"."rehearsal_trace_hash" = lower("cobia_execution_attempts"."rehearsal_trace_hash")
      AND "cobia_execution_attempts"."proof_hash" = lower("cobia_execution_attempts"."proof_hash")
      AND "cobia_execution_attempts"."proof_nonce" = lower("cobia_execution_attempts"."proof_nonce")
      AND "cobia_execution_attempts"."next_ordinal" >= 0
    ),
	CONSTRAINT "cobia_execution_attempts_state_check" CHECK (
      ("cobia_execution_attempts"."state" IN ('prepared', 'active', 'partial', 'reconcile')
        AND "cobia_execution_attempts"."completed_at" IS NULL AND "cobia_execution_attempts"."failure_code" IS NULL)
      OR ("cobia_execution_attempts"."state" = 'failed'
        AND "cobia_execution_attempts"."completed_at" IS NOT NULL AND "cobia_execution_attempts"."failure_code" IS NOT NULL)
      OR ("cobia_execution_attempts"."state" = 'complete'
        AND "cobia_execution_attempts"."completed_at" IS NOT NULL AND "cobia_execution_attempts"."failure_code" IS NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "cobia_execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"state" "cobia_execution_step_state" DEFAULT 'prepared' NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"value_atomic" text NOT NULL,
	"calldata" text NOT NULL,
	"calldata_hash" text NOT NULL,
	"semantic" jsonb NOT NULL,
	"pre_block_number" text NOT NULL,
	"pre_block_hash" text NOT NULL,
	"expected_nonce" text NOT NULL,
	"gas_estimate_atomic" text NOT NULL,
	"transaction_hash" text,
	"receipt" jsonb,
	"evidence" jsonb,
	"postcondition" jsonb,
	"failure_code" text,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobia_execution_steps_identity_check" CHECK (
      "cobia_execution_steps"."ordinal" >= 0
      AND "cobia_execution_steps"."kind" IN ('approval', 'swap', 'supply')
      AND "cobia_execution_steps"."from_address" = lower("cobia_execution_steps"."from_address")
      AND "cobia_execution_steps"."to_address" = lower("cobia_execution_steps"."to_address")
      AND "cobia_execution_steps"."value_atomic" ~ '^(0|[1-9][0-9]*)$'
      AND "cobia_execution_steps"."pre_block_number" ~ '^(0|[1-9][0-9]*)$'
      AND "cobia_execution_steps"."expected_nonce" ~ '^(0|[1-9][0-9]*)$'
      AND "cobia_execution_steps"."gas_estimate_atomic" ~ '^(0|[1-9][0-9]*)$'
      AND "cobia_execution_steps"."calldata" = lower("cobia_execution_steps"."calldata")
      AND "cobia_execution_steps"."calldata_hash" = lower("cobia_execution_steps"."calldata_hash")
      AND "cobia_execution_steps"."pre_block_hash" = lower("cobia_execution_steps"."pre_block_hash")
    ),
	CONSTRAINT "cobia_execution_steps_state_check" CHECK (
      ("cobia_execution_steps"."state" = 'prepared'
        AND "cobia_execution_steps"."transaction_hash" IS NULL AND "cobia_execution_steps"."submitted_at" IS NULL
        AND "cobia_execution_steps"."receipt" IS NULL AND "cobia_execution_steps"."evidence" IS NULL
        AND "cobia_execution_steps"."postcondition" IS NULL AND "cobia_execution_steps"."failure_code" IS NULL
        AND "cobia_execution_steps"."resolved_at" IS NULL)
      OR ("cobia_execution_steps"."state" = 'submitted'
        AND "cobia_execution_steps"."transaction_hash" IS NOT NULL AND "cobia_execution_steps"."submitted_at" IS NOT NULL
        AND "cobia_execution_steps"."receipt" IS NULL AND "cobia_execution_steps"."evidence" IS NULL
        AND "cobia_execution_steps"."postcondition" IS NULL AND "cobia_execution_steps"."failure_code" IS NULL
        AND "cobia_execution_steps"."resolved_at" IS NULL)
      OR ("cobia_execution_steps"."state" = 'confirmed'
        AND "cobia_execution_steps"."transaction_hash" IS NOT NULL AND "cobia_execution_steps"."submitted_at" IS NOT NULL
        AND "cobia_execution_steps"."receipt" IS NOT NULL AND "cobia_execution_steps"."evidence" IS NOT NULL
        AND "cobia_execution_steps"."postcondition" IS NOT NULL AND "cobia_execution_steps"."failure_code" IS NULL
        AND "cobia_execution_steps"."resolved_at" IS NOT NULL)
      OR ("cobia_execution_steps"."state" = 'reconcile'
        AND "cobia_execution_steps"."transaction_hash" IS NOT NULL AND "cobia_execution_steps"."submitted_at" IS NOT NULL
        AND "cobia_execution_steps"."receipt" IS NULL AND "cobia_execution_steps"."evidence" IS NULL
        AND "cobia_execution_steps"."postcondition" IS NULL AND "cobia_execution_steps"."failure_code" IS NOT NULL
        AND "cobia_execution_steps"."resolved_at" IS NULL)
      OR ("cobia_execution_steps"."state" = 'failed'
        AND "cobia_execution_steps"."receipt" IS NULL AND "cobia_execution_steps"."evidence" IS NULL
        AND "cobia_execution_steps"."postcondition" IS NULL AND "cobia_execution_steps"."failure_code" IS NOT NULL
        AND "cobia_execution_steps"."resolved_at" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "cobia_execution_attempts" ADD CONSTRAINT "cobia_execution_attempts_route_id_cobia_route_purchases_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."cobia_route_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_execution_attempts" ADD CONSTRAINT "cobia_execution_attempts_rehearsal_id_cobia_execution_rehearsals_id_fk" FOREIGN KEY ("rehearsal_id") REFERENCES "public"."cobia_execution_rehearsals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_execution_steps" ADD CONSTRAINT "cobia_execution_steps_attempt_id_cobia_execution_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."cobia_execution_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_attempts_route_idx" ON "cobia_execution_attempts" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_attempts_rehearsal_idx" ON "cobia_execution_attempts" USING btree ("rehearsal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_attempts_proof_idx" ON "cobia_execution_attempts" USING btree ("proof_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_attempts_nonce_idx" ON "cobia_execution_attempts" USING btree ("proof_nonce");--> statement-breakpoint
CREATE INDEX "cobia_execution_attempts_buyer_idx" ON "cobia_execution_attempts" USING btree ("buyer","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_steps_ordinal_idx" ON "cobia_execution_steps" USING btree ("attempt_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_steps_transaction_idx" ON "cobia_execution_steps" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "cobia_execution_steps_attempt_idx" ON "cobia_execution_steps" USING btree ("attempt_id","state");