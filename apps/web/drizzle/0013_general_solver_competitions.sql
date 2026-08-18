CREATE TYPE "public"."cobia_challenge_status" AS ENUM('active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."cobia_intent_state" AS ENUM('signed', 'collecting', 'closed', 'selected', 'executed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cobia_solver_operator_kind" AS ENUM('internal', 'community');--> statement-breakpoint
CREATE TYPE "public"."cobia_solver_submission_state" AS ENUM('proposed', 'rejected', 'verified', 'attested', 'superseded', 'executed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cobia_program_artifact_kind_v2" AS ENUM('program', 'evidence', 'provenance', 'verdict', 'replay', 'authorization', 'receipt', 'objective');--> statement-breakpoint

CREATE TABLE "cobia_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "chain_id" integer NOT NULL,
  "title" text NOT NULL,
  "display_goal" text NOT NULL,
  "policy_template" jsonb NOT NULL,
  "manifest_hash" text NOT NULL,
  "status" "cobia_challenge_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_challenges_identity_check" CHECK (
    "id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND "chain_id" = 196
    AND length(btrim("title")) BETWEEN 1 AND 120
    AND length(btrim("display_goal")) BETWEEN 1 AND 500
    AND jsonb_typeof("policy_template") = 'object'
    AND "manifest_hash" ~ '^0x[0-9a-f]{64}$'
  )
);--> statement-breakpoint

CREATE TABLE "cobia_challenge_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "challenge_id" text NOT NULL,
  "opens_at" timestamp with time zone NOT NULL,
  "closes_at" timestamp with time zone NOT NULL,
  "anchor_block_number" text NOT NULL,
  "anchor_block_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_challenge_rounds_bounds_check" CHECK (
    "closes_at" > "opens_at"
    AND "closes_at" <= "opens_at" + interval '1 hour'
    AND "anchor_block_number" ~ '^[1-9][0-9]*$'
    AND "anchor_block_hash" ~ '^0x[0-9a-f]{64}$'
  )
);--> statement-breakpoint

CREATE TABLE "cobia_intents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "chain_id" integer NOT NULL,
  "display_goal" text NOT NULL,
  "policy_hash" text NOT NULL,
  "policy" jsonb NOT NULL,
  "owner_signature" text NOT NULL,
  "state" "cobia_intent_state" DEFAULT 'signed' NOT NULL,
  "competition_closes_at" timestamp with time zone NOT NULL,
  "selected_submission_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_intents_policy_check" CHECK (
    "chain_id" = 196
    AND "owner" ~ '^0x[0-9a-f]{40}$'
    AND "policy_hash" ~ '^0x[0-9a-f]{64}$'
    AND "owner_signature" ~ '^0x[0-9a-fA-F]{130}$'
    AND length(btrim("display_goal")) BETWEEN 1 AND 500
    AND ("policy"->>'version')::integer = 2
    AND "policy"->>'kind' = 'general-onchain'
    AND "policy"->>'requestId' = "id"::text
    AND lower("policy"->>'owner') = "owner"
    AND ("policy"->>'executionChainId')::integer = 196
    AND "policy"->>'displayGoal' = "display_goal"
    AND to_timestamp(("policy"->'competition'->>'closesAt')::bigint)
      = "competition_closes_at"
  )
);--> statement-breakpoint

CREATE TABLE "cobia_solvers" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "operator_kind" "cobia_solver_operator_kind" NOT NULL,
  "attestation_address" text,
  "declared_capabilities" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_solvers_identity_check" CHECK (
    "id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length(btrim("display_name")) BETWEEN 1 AND 80
    AND jsonb_typeof("declared_capabilities") = 'array'
    AND ("operator_kind" = 'internal' OR
      ("attestation_address" IS NOT NULL AND
        "attestation_address" ~ '^0x[0-9a-f]{40}$'))
  )
);--> statement-breakpoint

CREATE TABLE "cobia_solver_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intent_id" uuid,
  "challenge_round_id" uuid,
  "solver_id" text NOT NULL,
  "revision" integer NOT NULL,
  "state" "cobia_solver_submission_state" DEFAULT 'proposed' NOT NULL,
  "program_hash" text NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "block_number" text NOT NULL,
  "block_hash" text NOT NULL,
  "failure_codes" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "cobia_submissions_parent_check" CHECK (
    (("intent_id" IS NOT NULL)::integer +
      ("challenge_round_id" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "cobia_submissions_identity_check" CHECK (
    "revision" BETWEEN 1 AND 20
    AND "program_hash" ~ '^0x[0-9a-f]{64}$'
    AND "block_number" ~ '^[1-9][0-9]*$'
    AND "block_hash" ~ '^0x[0-9a-f]{64}$'
    AND "valid_until" > "created_at"
  ),
  CONSTRAINT "cobia_submissions_failure_check" CHECK (
    (("state" IN ('rejected', 'failed')) = (cardinality("failure_codes") > 0))
    AND ("challenge_round_id" IS NULL OR "state" NOT IN ('attested', 'executed'))
  )
);--> statement-breakpoint

CREATE TABLE "cobia_program_artifacts_v2" (
  "id" serial PRIMARY KEY NOT NULL,
  "submission_id" uuid NOT NULL,
  "kind" "cobia_program_artifact_kind_v2" NOT NULL,
  "artifact_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_program_artifacts_v2_hash_check" CHECK (
    "artifact_hash" ~ '^0x[0-9a-f]{64}$'
  )
);--> statement-breakpoint

ALTER TABLE "cobia_challenge_rounds" ADD CONSTRAINT "cobia_challenge_rounds_challenge_id_fk"
  FOREIGN KEY ("challenge_id") REFERENCES "public"."cobia_challenges"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_submissions" ADD CONSTRAINT "cobia_submissions_intent_id_fk"
  FOREIGN KEY ("intent_id") REFERENCES "public"."cobia_intents"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_submissions" ADD CONSTRAINT "cobia_submissions_round_id_fk"
  FOREIGN KEY ("challenge_round_id") REFERENCES "public"."cobia_challenge_rounds"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_submissions" ADD CONSTRAINT "cobia_submissions_solver_id_fk"
  FOREIGN KEY ("solver_id") REFERENCES "public"."cobia_solvers"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_program_artifacts_v2" ADD CONSTRAINT "cobia_program_artifacts_v2_submission_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "public"."cobia_solver_submissions"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_intents" ADD CONSTRAINT "cobia_intents_selected_submission_id_fk"
  FOREIGN KEY ("selected_submission_id") REFERENCES "public"."cobia_solver_submissions"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "cobia_challenges_status_idx" ON "cobia_challenges" ("status", "updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_challenge_rounds_open_idx" ON "cobia_challenge_rounds" ("challenge_id", "opens_at");--> statement-breakpoint
CREATE INDEX "cobia_challenge_rounds_close_idx" ON "cobia_challenge_rounds" ("challenge_id", "closes_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_intents_policy_hash_idx" ON "cobia_intents" ("policy_hash");--> statement-breakpoint
CREATE INDEX "cobia_intents_owner_idx" ON "cobia_intents" ("owner", "created_at");--> statement-breakpoint
CREATE INDEX "cobia_intents_state_idx" ON "cobia_intents" ("state", "competition_closes_at");--> statement-breakpoint
CREATE INDEX "cobia_solvers_kind_idx" ON "cobia_solvers" ("operator_kind", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_submissions_intent_revision_idx"
  ON "cobia_solver_submissions" ("intent_id", "solver_id", "revision");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_submissions_round_revision_idx"
  ON "cobia_solver_submissions" ("challenge_round_id", "solver_id", "revision");--> statement-breakpoint
CREATE INDEX "cobia_submissions_intent_state_idx"
  ON "cobia_solver_submissions" ("intent_id", "state", "valid_until");--> statement-breakpoint
CREATE INDEX "cobia_submissions_round_state_idx"
  ON "cobia_solver_submissions" ("challenge_round_id", "state", "valid_until");--> statement-breakpoint
CREATE INDEX "cobia_submissions_solver_idx"
  ON "cobia_solver_submissions" ("solver_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_program_artifacts_v2_kind_idx"
  ON "cobia_program_artifacts_v2" ("submission_id", "kind");--> statement-breakpoint

CREATE FUNCTION cobia_reject_program_artifact_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Program artifacts are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER cobia_program_artifacts_v2_immutable
  BEFORE UPDATE OR DELETE ON cobia_program_artifacts_v2
  FOR EACH ROW EXECUTE FUNCTION cobia_reject_program_artifact_mutation();--> statement-breakpoint

CREATE FUNCTION cobia_guard_submission_identity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Solver submissions are immutable';
  END IF;
  IF (NEW.id, NEW.intent_id, NEW.challenge_round_id, NEW.solver_id, NEW.revision,
      NEW.program_hash, NEW.valid_until, NEW.block_number, NEW.block_hash, NEW.created_at)
    IS DISTINCT FROM
     (OLD.id, OLD.intent_id, OLD.challenge_round_id, OLD.solver_id, OLD.revision,
      OLD.program_hash, OLD.valid_until, OLD.block_number, OLD.block_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'Solver submission identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER cobia_solver_submissions_immutable_identity
  BEFORE UPDATE OR DELETE ON cobia_solver_submissions
  FOR EACH ROW EXECUTE FUNCTION cobia_guard_submission_identity();
