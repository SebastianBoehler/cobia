ALTER TABLE "cobia_solver_runs"
  DROP CONSTRAINT "cobia_solver_runs_state_check";--> statement-breakpoint
ALTER TABLE "cobia_solver_runs"
  ADD CONSTRAINT "cobia_solver_runs_state_check" CHECK (
    ("state" IN ('queued', 'running')
      AND "completed_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'completed'
      AND "completed_at" IS NOT NULL AND "failure_code" IS NULL)
    OR ("state" = 'abstained'
      AND "completed_at" IS NOT NULL
      AND ("failure_code" IS NULL
        OR "failure_code" ~ '^[A-Z][A-Z0-9_]{2,63}$'))
    OR ("state" = 'failed'
      AND "completed_at" IS NOT NULL
      AND "failure_code" ~ '^[A-Z][A-Z0-9_]{2,63}$')
  );
