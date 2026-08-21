CREATE TYPE "public"."cobia_wallet_compile_state" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "cobia_wallet_auth_challenges" (
  "nonce_hash" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "message" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_wallet_auth_challenge_check" CHECK (
    "nonce_hash" ~ '^[0-9a-f]{64}$'
    AND "owner" ~ '^0x[0-9a-f]{40}$'
    AND ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
  )
);--> statement-breakpoint
CREATE TABLE "cobia_wallet_auth_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_wallet_auth_session_check" CHECK (
    "token_hash" ~ '^[0-9a-f]{64}$'
    AND "owner" ~ '^0x[0-9a-f]{40}$'
    AND "expires_at" > "created_at"
  )
);--> statement-breakpoint
CREATE TABLE "cobia_intent_compile_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner" text NOT NULL,
  "client_key" text NOT NULL,
  "goal_hash" text NOT NULL,
  "action_preference" text NOT NULL,
  "state" "cobia_wallet_compile_state" DEFAULT 'pending' NOT NULL,
  "result" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_intent_compile_attempt_check" CHECK (
    "owner" ~ '^0x[0-9a-f]{40}$'
    AND "client_key" ~ '^[0-9a-f]{64}$'
    AND "goal_hash" ~ '^[0-9a-f]{64}$'
    AND (
      ("state" = 'pending' AND "result" IS NULL AND "completed_at" IS NULL)
      OR ("state" = 'completed' AND "result" IS NOT NULL AND "completed_at" IS NOT NULL)
      OR ("state" = 'failed' AND "result" IS NULL AND "completed_at" IS NOT NULL)
    )
  )
);--> statement-breakpoint
CREATE INDEX "cobia_wallet_auth_sessions_owner_idx"
  ON "cobia_wallet_auth_sessions" ("owner", "expires_at");--> statement-breakpoint
CREATE INDEX "cobia_intent_compile_owner_idx"
  ON "cobia_intent_compile_attempts" ("owner", "created_at");--> statement-breakpoint
CREATE INDEX "cobia_intent_compile_client_idx"
  ON "cobia_intent_compile_attempts" ("client_key", "created_at");--> statement-breakpoint
CREATE INDEX "cobia_intent_compile_cache_idx"
  ON "cobia_intent_compile_attempts" ("owner", "goal_hash", "completed_at");
