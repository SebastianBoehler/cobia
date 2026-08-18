ALTER TYPE "public"."cobia_program_artifact_kind_v2"
  ADD VALUE 'execution' BEFORE 'authorization';--> statement-breakpoint
CREATE TYPE "public"."cobia_solver_run_state"
  AS ENUM('queued', 'running', 'completed', 'abstained', 'failed');--> statement-breakpoint

CREATE TABLE "cobia_solver_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intent_id" uuid NOT NULL,
  "solver_id" text NOT NULL,
  "revision" integer NOT NULL,
  "state" "cobia_solver_run_state" DEFAULT 'queued' NOT NULL,
  "block_number" text NOT NULL,
  "block_hash" text NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "cobia_solver_runs_identity_check" CHECK (
    "revision" BETWEEN 1 AND 20
    AND "block_number" ~ '^[1-9][0-9]*$'
    AND "block_hash" ~ '^0x[0-9a-f]{64}$'
  ),
  CONSTRAINT "cobia_solver_runs_state_check" CHECK (
    ("state" IN ('queued', 'running')
      AND "completed_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" IN ('completed', 'abstained')
      AND "completed_at" IS NOT NULL AND "failure_code" IS NULL)
    OR ("state" = 'failed'
      AND "completed_at" IS NOT NULL
      AND "failure_code" ~ '^[A-Z][A-Z0-9_]{2,63}$')
  )
);--> statement-breakpoint

ALTER TABLE "cobia_solver_runs" ADD CONSTRAINT "cobia_solver_runs_intent_id_fk"
  FOREIGN KEY ("intent_id") REFERENCES "public"."cobia_intents"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_solver_runs" ADD CONSTRAINT "cobia_solver_runs_solver_id_fk"
  FOREIGN KEY ("solver_id") REFERENCES "public"."cobia_solvers"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_solver_runs_revision_idx"
  ON "cobia_solver_runs" ("intent_id", "solver_id", "revision");--> statement-breakpoint
CREATE INDEX "cobia_solver_runs_state_idx"
  ON "cobia_solver_runs" ("state", "updated_at");
