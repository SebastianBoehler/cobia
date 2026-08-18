CREATE TYPE "public"."cobia_commerce_placement_state" AS ENUM(
  'prepared', 'authorizing', 'submitted', 'confirmed', 'rejected'
);
--> statement-breakpoint
CREATE TABLE "cobia_commerce_placements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "offer_commitment" text NOT NULL,
  "policy_hash" text NOT NULL,
  "program_hash" text NOT NULL,
  "manifest_hash" text NOT NULL,
  "plan_hash" text NOT NULL,
  "authorization_template_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "cobia_commerce_placements_identity_check" CHECK (
    "owner" ~ '^0x[0-9a-f]{40}$'
    AND "offer_commitment" ~ '^0x[0-9a-f]{64}$'
    AND "policy_hash" ~ '^0x[0-9a-f]{64}$'
    AND "program_hash" ~ '^0x[0-9a-f]{64}$'
    AND "manifest_hash" ~ '^0x[0-9a-f]{64}$'
    AND "plan_hash" ~ '^0x[0-9a-f]{64}$'
    AND "authorization_template_hash" ~ '^0x[0-9a-f]{64}$'
  )
);
--> statement-breakpoint
ALTER TABLE "cobia_commerce_placements" ADD CONSTRAINT "cobia_commerce_placements_offer_fk"
  FOREIGN KEY ("offer_commitment") REFERENCES "public"."cobia_commerce_offer_snapshots"("commitment")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_commerce_placements_policy_idx" ON "cobia_commerce_placements" ("policy_hash");
--> statement-breakpoint
CREATE INDEX "cobia_commerce_placements_owner_idx" ON "cobia_commerce_placements" ("owner", "created_at");
--> statement-breakpoint
CREATE TABLE "cobia_commerce_placement_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "placement_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "state" "cobia_commerce_placement_state" NOT NULL,
  "authorization_hash" text,
  "transaction_hash" text,
  "evidence_hash" text,
  "rejection_code" text,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "cobia_commerce_placement_events_payload_check" CHECK (
    ("state" = 'prepared' AND "authorization_hash" IS NULL AND "transaction_hash" IS NULL
      AND "evidence_hash" IS NULL AND "rejection_code" IS NULL)
    OR ("state" = 'authorizing' AND "authorization_hash" IS NOT NULL AND "transaction_hash" IS NULL
      AND "evidence_hash" IS NULL AND "rejection_code" IS NULL)
    OR ("state" = 'submitted' AND "authorization_hash" IS NULL AND "transaction_hash" IS NOT NULL
      AND "evidence_hash" IS NULL AND "rejection_code" IS NULL)
    OR ("state" = 'confirmed' AND "authorization_hash" IS NULL AND "transaction_hash" IS NULL
      AND "evidence_hash" IS NOT NULL AND "rejection_code" IS NULL)
    OR ("state" = 'rejected' AND "authorization_hash" IS NULL AND "transaction_hash" IS NULL
      AND "evidence_hash" IS NULL AND "rejection_code" ~ '^[A-Z][A-Z0-9_]{2,63}$')
  )
);
--> statement-breakpoint
ALTER TABLE "cobia_commerce_placement_events" ADD CONSTRAINT "cobia_commerce_placement_events_placement_fk"
  FOREIGN KEY ("placement_id") REFERENCES "public"."cobia_commerce_placements"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_commerce_placement_events_sequence_idx"
  ON "cobia_commerce_placement_events" ("placement_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_commerce_placement_events_authorization_idx"
  ON "cobia_commerce_placement_events" ("authorization_hash");
--> statement-breakpoint
CREATE INDEX "cobia_commerce_placement_events_state_idx"
  ON "cobia_commerce_placement_events" ("state", "created_at");
