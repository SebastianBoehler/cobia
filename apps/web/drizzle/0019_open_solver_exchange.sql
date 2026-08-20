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
  ADD VALUE IF NOT EXISTS 'provider' BEFORE 'evidence';
