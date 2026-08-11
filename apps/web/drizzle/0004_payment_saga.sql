CREATE TYPE "public"."cobia_payment_state" AS ENUM('pending', 'settled', 'finalized');--> statement-breakpoint
CREATE TABLE "cobia_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"quote_id" text NOT NULL,
	"state" "cobia_payment_state" DEFAULT 'pending' NOT NULL,
	"payer" text NOT NULL,
	"payment_chain_id" integer NOT NULL,
	"execution_chain_id" integer NOT NULL,
	"realm" text NOT NULL,
	"currency" text NOT NULL,
	"decimals" integer NOT NULL,
	"amount_atomic" text NOT NULL,
	"recipient" text NOT NULL,
	"fee_payer" boolean NOT NULL,
	"splits" jsonb NOT NULL,
	"external_id" text NOT NULL,
	"payment_terms" jsonb NOT NULL,
	"payment_terms_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reveal_proof_hash" text NOT NULL,
	"reveal_nonce" text NOT NULL,
	"proof_expires_at" timestamp with time zone NOT NULL,
	"challenge_id" text,
	"credential_hash" text,
	"authorization_valid_after" timestamp with time zone,
	"receipt_header" text,
	"receipt_hash" text,
	"receipt_payload" jsonb,
	"receipt_method" text,
	"receipt_status" text,
	"receipt_reference" text,
	"receipt_timestamp" timestamp with time zone,
	"receipt_chain_id" integer,
	"receipt_challenge_id" text,
	"receipt_external_id" text,
	"settled_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
		CONSTRAINT "cobia_payments_support_check" CHECK (
	      "cobia_payments"."payment_chain_id" = 1952 AND "cobia_payments"."execution_chain_id" = 196
	      AND "cobia_payments"."decimals" = 6 AND "cobia_payments"."amount_atomic" = '100000'
	      AND "cobia_payments"."fee_payer" = true
	    ),
		CONSTRAINT "cobia_payments_credential_window_check" CHECK (
	      ("cobia_payments"."credential_hash" IS NULL AND "cobia_payments"."authorization_valid_after" IS NULL)
	      OR ("cobia_payments"."credential_hash" IS NOT NULL AND "cobia_payments"."authorization_valid_after" IS NOT NULL
	        AND "cobia_payments"."challenge_id" IS NOT NULL
	        AND "cobia_payments"."authorization_valid_after" < "cobia_payments"."expires_at")
	    ),
		CONSTRAINT "cobia_payments_receipt_state_check" CHECK (
	      ("cobia_payments"."state" = 'pending' AND "cobia_payments"."receipt_header" IS NULL
	        AND "cobia_payments"."receipt_hash" IS NULL AND "cobia_payments"."receipt_payload" IS NULL
	        AND "cobia_payments"."receipt_method" IS NULL AND "cobia_payments"."receipt_status" IS NULL
	        AND "cobia_payments"."receipt_reference" IS NULL AND "cobia_payments"."receipt_timestamp" IS NULL
	        AND "cobia_payments"."receipt_chain_id" IS NULL AND "cobia_payments"."receipt_challenge_id" IS NULL
	        AND "cobia_payments"."receipt_external_id" IS NULL AND "cobia_payments"."settled_at" IS NULL)
	      OR ("cobia_payments"."state" IN ('settled', 'finalized')
	        AND "cobia_payments"."challenge_id" IS NOT NULL AND "cobia_payments"."credential_hash" IS NOT NULL
	        AND "cobia_payments"."authorization_valid_after" IS NOT NULL
	        AND "cobia_payments"."receipt_header" IS NOT NULL AND "cobia_payments"."receipt_hash" IS NOT NULL
	        AND "cobia_payments"."receipt_payload" IS NOT NULL AND "cobia_payments"."receipt_method" = 'evm'
		        AND "cobia_payments"."receipt_status" = 'success' AND "cobia_payments"."receipt_reference" IS NOT NULL
		        AND "cobia_payments"."receipt_timestamp" IS NOT NULL
		        AND "cobia_payments"."receipt_timestamp" >= "cobia_payments"."issued_at"
		        AND "cobia_payments"."receipt_timestamp" >= "cobia_payments"."authorization_valid_after"
		        AND "cobia_payments"."receipt_timestamp" < "cobia_payments"."expires_at"
		        AND "cobia_payments"."receipt_chain_id" IS NOT NULL
	        AND "cobia_payments"."receipt_chain_id" = "cobia_payments"."payment_chain_id"
	        AND "cobia_payments"."receipt_challenge_id" IS NOT NULL
	        AND "cobia_payments"."receipt_challenge_id" = "cobia_payments"."challenge_id"
	        AND "cobia_payments"."receipt_external_id" IS NOT NULL
	        AND lower("cobia_payments"."receipt_external_id") = lower("cobia_payments"."external_id")
	        AND "cobia_payments"."settled_at" IS NOT NULL)
	    ),
	CONSTRAINT "cobia_payments_finalized_state_check" CHECK (
      ("cobia_payments"."state" = 'finalized') = ("cobia_payments"."finalized_at" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "cobia_activity_events" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "cobia_route_purchases" ADD COLUMN "payment_chain_id" integer;--> statement-breakpoint
ALTER TABLE "cobia_route_purchases" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "cobia_payments" ADD CONSTRAINT "cobia_payments_request_id_cobia_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cobia_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_payments" ADD CONSTRAINT "cobia_payments_quote_id_cobia_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."cobia_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_request_idx" ON "cobia_payments" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_quote_idx" ON "cobia_payments" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_external_id_idx" ON "cobia_payments" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_proof_idx" ON "cobia_payments" USING btree ("reveal_proof_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_nonce_idx" ON "cobia_payments" USING btree ("reveal_nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_challenge_idx" ON "cobia_payments" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_credential_idx" ON "cobia_payments" USING btree ("credential_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_receipt_idx" ON "cobia_payments" USING btree ("receipt_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_payments_reference_idx" ON "cobia_payments" USING btree ("receipt_reference");--> statement-breakpoint
ALTER TABLE "cobia_activity_events" ADD CONSTRAINT "cobia_activity_events_payment_id_cobia_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."cobia_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobia_route_purchases" ADD CONSTRAINT "cobia_route_purchases_payment_id_cobia_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."cobia_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_activity_events_payment_kind_idx" ON "cobia_activity_events" USING btree ("payment_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_route_purchases_payment_idx" ON "cobia_route_purchases" USING btree ("payment_id");
