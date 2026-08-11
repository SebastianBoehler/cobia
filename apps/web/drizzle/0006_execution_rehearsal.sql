CREATE TYPE "public"."cobia_execution_rehearsal_state" AS ENUM('running', 'passed', 'failed');--> statement-breakpoint
CREATE TABLE "cobia_execution_rehearsals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" text NOT NULL,
	"bundle_hash" text NOT NULL,
	"buyer" text NOT NULL,
	"execution_chain_id" integer NOT NULL,
	"state" "cobia_execution_rehearsal_state" DEFAULT 'running' NOT NULL,
	"proof_hash" text NOT NULL,
	"proof_nonce" text NOT NULL,
	"proof_expires_at" timestamp with time zone NOT NULL,
	"registry_hash" text,
	"snapshot_block_hash" text,
	"engine_version" text,
	"trace_hash" text,
	"trace" jsonb,
	"failure_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobia_execution_rehearsals_identity_check" CHECK (
      "cobia_execution_rehearsals"."execution_chain_id" = 196
      AND lower("cobia_execution_rehearsals"."route_id") = lower("cobia_execution_rehearsals"."bundle_hash")
    ),
	CONSTRAINT "cobia_execution_rehearsals_state_check" CHECK (
      ("cobia_execution_rehearsals"."state" = 'running'
        AND "cobia_execution_rehearsals"."registry_hash" IS NULL AND "cobia_execution_rehearsals"."snapshot_block_hash" IS NULL
        AND "cobia_execution_rehearsals"."engine_version" IS NULL AND "cobia_execution_rehearsals"."trace_hash" IS NULL
        AND "cobia_execution_rehearsals"."trace" IS NULL AND "cobia_execution_rehearsals"."failure_code" IS NULL
        AND "cobia_execution_rehearsals"."completed_at" IS NULL)
      OR ("cobia_execution_rehearsals"."state" = 'passed'
        AND "cobia_execution_rehearsals"."registry_hash" IS NOT NULL AND "cobia_execution_rehearsals"."snapshot_block_hash" IS NOT NULL
        AND "cobia_execution_rehearsals"."engine_version" IS NOT NULL AND "cobia_execution_rehearsals"."trace_hash" IS NOT NULL
        AND "cobia_execution_rehearsals"."trace" IS NOT NULL AND "cobia_execution_rehearsals"."failure_code" IS NULL
        AND "cobia_execution_rehearsals"."completed_at" IS NOT NULL)
      OR ("cobia_execution_rehearsals"."state" = 'failed'
        AND "cobia_execution_rehearsals"."registry_hash" IS NULL AND "cobia_execution_rehearsals"."snapshot_block_hash" IS NULL
        AND "cobia_execution_rehearsals"."engine_version" IS NULL AND "cobia_execution_rehearsals"."trace_hash" IS NULL
        AND "cobia_execution_rehearsals"."trace" IS NULL AND "cobia_execution_rehearsals"."failure_code" IS NOT NULL
        AND "cobia_execution_rehearsals"."completed_at" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "cobia_execution_rehearsals" ADD CONSTRAINT "cobia_execution_rehearsals_route_id_cobia_route_purchases_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."cobia_route_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobia_execution_rehearsals_route_idx" ON "cobia_execution_rehearsals" USING btree ("route_id","bundle_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_rehearsals_proof_idx" ON "cobia_execution_rehearsals" USING btree ("proof_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_rehearsals_nonce_idx" ON "cobia_execution_rehearsals" USING btree ("proof_nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_execution_rehearsals_trace_idx" ON "cobia_execution_rehearsals" USING btree ("trace_hash");