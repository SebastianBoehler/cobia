ALTER TABLE "cobia_intents" DROP CONSTRAINT "cobia_intents_policy_check";--> statement-breakpoint
UPDATE "cobia_intents"
SET "state" = 'closed', "updated_at" = now()
WHERE ("policy"->>'version')::integer <> 3
  AND "state" IN ('signed', 'collecting');--> statement-breakpoint
ALTER TABLE "cobia_intents" ADD CONSTRAINT "cobia_intents_policy_check" CHECK (
  "chain_id" = 196
  AND "owner" ~ '^0x[0-9a-f]{40}$'
  AND "policy_hash" ~ '^0x[0-9a-f]{64}$'
  AND "owner_signature" ~ '^0x[0-9a-fA-F]{130}$'
  AND length(btrim("display_goal")) BETWEEN 1 AND 1000
  AND ("policy"->>'version')::integer = 3
  AND "policy"->>'kind' = 'open-onchain'
  AND "policy"->>'requestId' = "id"::text
  AND lower("policy"->>'owner') = "owner"
  AND "policy"->'executionChainIds' @> '[196]'::jsonb
  AND "policy"->>'displayGoal' = "display_goal"
  AND to_timestamp(("policy"->'competition'->>'closesAt')::bigint)
    = "competition_closes_at"
) NOT VALID;--> statement-breakpoint
ALTER TYPE "public"."cobia_program_artifact_kind_v2"
  ADD VALUE IF NOT EXISTS 'provider' BEFORE 'evidence';--> statement-breakpoint
CREATE TABLE "cobia_open_intent_snapshots" (
  "intent_id" uuid PRIMARY KEY NOT NULL,
  "snapshot_hash" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_open_snapshots_identity_check" CHECK (
    "snapshot_hash" ~ '^0x[0-9a-f]{64}$'
    AND "snapshot"->>'requestId' = "intent_id"::text
    AND ("snapshot"->>'version')::integer = 1
    AND "snapshot"->>'kind' = 'open-onchain'
  )
);--> statement-breakpoint
CREATE TABLE "cobia_solver_decision_claims" (
  "nonce" text PRIMARY KEY NOT NULL,
  "claim_hash" text NOT NULL,
  "intent_id" uuid NOT NULL,
  "solver_id" text NOT NULL,
  "claim" jsonb NOT NULL,
  "signature" text NOT NULL,
  "decision" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_solver_decision_claim_check" CHECK (
    "nonce" ~ '^0x[0-9a-f]{64}$'
    AND "claim_hash" ~ '^0x[0-9a-f]{64}$'
    AND "signature" ~ '^0x[0-9a-fA-F]{130}$'
    AND "claim"->>'intentId' = "intent_id"::text
    AND "claim"->>'solverId' = "solver_id"
    AND lower("claim"->>'nonce') = "nonce"
  )
);--> statement-breakpoint
CREATE TYPE "public"."cobia_solver_success_fee_state" AS ENUM('authorized', 'settling', 'settled', 'uncertain', 'expired');--> statement-breakpoint
CREATE TABLE "cobia_solver_success_fees" (
  "submission_id" uuid PRIMARY KEY NOT NULL,
  "solver_id" text NOT NULL,
  "owner" text NOT NULL,
  "recipient" text NOT NULL,
  "amount_atomic" text NOT NULL,
  "terms_hash" text NOT NULL,
  "terms" jsonb NOT NULL,
  "credential_hash" text NOT NULL,
  "credential" jsonb NOT NULL,
  "state" "cobia_solver_success_fee_state" DEFAULT 'authorized' NOT NULL,
  "settlement" jsonb,
  "error_code" text,
  "expires_at" timestamp with time zone NOT NULL,
  "authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone,
  CONSTRAINT "cobia_solver_success_fee_check" CHECK (
    "owner" ~ '^0x[0-9a-f]{40}$'
    AND "recipient" ~ '^0x[0-9a-f]{40}$'
    AND "amount_atomic" ~ '^[1-9][0-9]*$'
    AND "terms_hash" ~ '^0x[0-9a-f]{64}$'
    AND "credential_hash" ~ '^0x[0-9a-f]{64}$'
    AND (("state" = 'settled') = ("settlement" IS NOT NULL))
  )
);--> statement-breakpoint
ALTER TABLE "cobia_open_intent_snapshots" ADD CONSTRAINT "cobia_open_intent_snapshots_intent_id_cobia_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."cobia_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_decision_claims" ADD CONSTRAINT "cobia_solver_decision_claims_intent_id_cobia_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."cobia_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_decision_claims" ADD CONSTRAINT "cobia_solver_decision_claims_solver_id_cobia_solvers_id_fk" FOREIGN KEY ("solver_id") REFERENCES "public"."cobia_solvers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_success_fees" ADD CONSTRAINT "cobia_solver_success_fees_submission_id_cobia_solver_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cobia_solver_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_success_fees" ADD CONSTRAINT "cobia_solver_success_fees_solver_id_cobia_solvers_id_fk" FOREIGN KEY ("solver_id") REFERENCES "public"."cobia_solvers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_open_snapshots_hash_idx" ON "cobia_open_intent_snapshots" USING btree ("snapshot_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_solver_decision_claim_hash_idx" ON "cobia_solver_decision_claims" USING btree ("claim_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_solver_decision_revision_idx" ON "cobia_solver_decision_claims" USING btree ("intent_id","solver_id",(("claim"->>'revision')::integer));
--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_solver_success_fee_credential_idx" ON "cobia_solver_success_fees" USING btree ("credential_hash");
