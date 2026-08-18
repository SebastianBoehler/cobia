CREATE TABLE "cobia_commerce_offer_snapshots" (
  "commitment" text PRIMARY KEY NOT NULL,
  "offer_id" text NOT NULL,
  "source_protocol" text NOT NULL,
  "source_url" text NOT NULL,
  "source_response_hash" text NOT NULL,
  "chain_id" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "eligibility" text NOT NULL,
  "canonical_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cobia_commerce_offers_identity_check" CHECK (
    "commitment" ~ '^0x[0-9a-f]{64}$'
    AND "source_response_hash" ~ '^0x[0-9a-f]{64}$'
    AND length(btrim("offer_id")) BETWEEN 1 AND 256
    AND "source_protocol" IN ('x402-v2', 'ucp-catalog')
    AND "eligibility" IN ('executable', 'discovery-only', 'blocked')
    AND "chain_id" > 0
    AND jsonb_typeof("canonical_json") = 'object'
  )
);
--> statement-breakpoint
CREATE INDEX "cobia_commerce_offers_expiry_idx"
  ON "cobia_commerce_offer_snapshots" USING btree ("expires_at", "offer_id");
--> statement-breakpoint
CREATE INDEX "cobia_commerce_offers_source_idx"
  ON "cobia_commerce_offer_snapshots" USING btree ("source_protocol", "created_at");
