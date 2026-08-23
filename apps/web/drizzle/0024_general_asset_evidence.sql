ALTER TABLE "cobia_intents"
  ADD COLUMN "general_asset_evidence_hash" text,
  ADD COLUMN "general_asset_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "cobia_intents" DROP CONSTRAINT "cobia_intents_policy_check";--> statement-breakpoint
ALTER TABLE "cobia_intents" ADD CONSTRAINT "cobia_intents_policy_check" CHECK (
  "cobia_intents"."chain_id" IN (1, 196)
  AND "cobia_intents"."owner" ~ '^0x[0-9a-f]{40}$'
  AND "cobia_intents"."policy_hash" ~ '^0x[0-9a-f]{64}$'
  AND "cobia_intents"."owner_signature" ~ '^0x[0-9a-fA-F]{130}$'
  AND length(btrim("cobia_intents"."display_goal")) BETWEEN 1 AND 1000
  AND (("cobia_intents"."general_asset_evidence_hash" IS NULL)
    = ("cobia_intents"."general_asset_evidence" IS NULL))
  AND (("cobia_intents"."policy"->>'kind' = 'general-asset')
    = ("cobia_intents"."general_asset_evidence" IS NOT NULL))
  AND ("cobia_intents"."general_asset_evidence_hash" IS NULL
    OR "cobia_intents"."general_asset_evidence_hash" ~ '^0x[0-9a-f]{64}$')
  AND (
    (("cobia_intents"."policy"->>'version')::integer = 3
      AND "cobia_intents"."policy"->>'kind' = 'open-onchain'
      AND "cobia_intents"."chain_id" = 196
      AND "cobia_intents"."policy"->'executionChainIds' @> '[196]'::jsonb)
    OR (("cobia_intents"."policy"->>'version')::integer = 1
      AND "cobia_intents"."policy"->>'kind' = 'capability-composition'
      AND "cobia_intents"."chain_id" = 196
      AND ("cobia_intents"."policy"->>'executionChainId')::integer = 196)
    OR (("cobia_intents"."policy"->>'version')::integer = 1
      AND "cobia_intents"."policy"->>'kind' = 'general-asset'
      AND ("cobia_intents"."policy"->>'sourceChainId')::integer = "cobia_intents"."chain_id"
      AND ("cobia_intents"."policy"->>'destinationChainId')::integer IN (1, 196)
      AND ("cobia_intents"."policy"->'input'->>'chainId')::integer = "cobia_intents"."chain_id")
  )
  AND "cobia_intents"."policy"->>'requestId' = "cobia_intents"."id"::text
  AND lower("cobia_intents"."policy"->>'owner') = "cobia_intents"."owner"
  AND "cobia_intents"."policy"->>'displayGoal' = "cobia_intents"."display_goal"
  AND to_timestamp(("cobia_intents"."policy"->'competition'->>'closesAt')::bigint)
    = "cobia_intents"."competition_closes_at"
);
