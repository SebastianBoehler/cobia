CREATE TYPE "cobia_agent_program_state" AS ENUM ('queued', 'running', 'rejected', 'verified', 'attested', 'failed');--> statement-breakpoint
CREATE TYPE "cobia_agent_artifact_kind" AS ENUM ('program', 'evidence', 'provenance', 'verdict', 'replay', 'execution', 'authorization');--> statement-breakpoint
CREATE TABLE "cobia_agent_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "owner" text NOT NULL,
  "chain_id" integer NOT NULL,
  "policy_hash" text NOT NULL,
  "snapshot_hash" text NOT NULL,
  "manifest_hash" text NOT NULL,
  "block_number" text NOT NULL,
  "block_hash" text NOT NULL,
  "state" "cobia_agent_program_state" DEFAULT 'queued' NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "cobia_agent_programs_request_idx" UNIQUE("request_id"),
  CONSTRAINT "cobia_agent_programs_identity_check" CHECK (
    "chain_id" = 196 AND "owner" = lower("owner") AND "block_number" ~ '^[1-9][0-9]*$'
    AND "policy_hash" = lower("policy_hash") AND "snapshot_hash" = lower("snapshot_hash")
    AND "manifest_hash" = lower("manifest_hash") AND "block_hash" = lower("block_hash")
  ),
  CONSTRAINT "cobia_agent_programs_state_check" CHECK (
    ("state" IN ('queued', 'running', 'verified') AND "completed_at" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'attested' AND "completed_at" IS NOT NULL AND "failure_code" IS NULL)
    OR ("state" IN ('rejected', 'failed') AND "completed_at" IS NOT NULL AND "failure_code" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE TABLE "cobia_agent_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "program_id" uuid NOT NULL,
  "kind" "cobia_agent_artifact_kind" NOT NULL,
  "artifact_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_agent_artifacts_kind_idx" UNIQUE("program_id", "kind"),
  CONSTRAINT "cobia_agent_artifacts_hash_check" CHECK ("artifact_hash" = lower("artifact_hash"))
);--> statement-breakpoint
ALTER TABLE "cobia_agent_programs" ADD CONSTRAINT "cobia_agent_programs_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cobia_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_agent_artifacts" ADD CONSTRAINT "cobia_agent_artifacts_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."cobia_agent_programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobia_agent_programs_owner_idx" ON "cobia_agent_programs" USING btree ("owner", "updated_at");
