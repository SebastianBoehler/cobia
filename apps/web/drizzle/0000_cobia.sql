CREATE TYPE "public"."cobia_request_state" AS ENUM('open', 'collecting', 'verifying', 'quotes_ready', 'partial', 'selected', 'payment_pending', 'paid', 'revealed', 'executed', 'failed');--> statement-breakpoint
CREATE TABLE "cobia_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"solver_id" text NOT NULL,
	"private_bundle" jsonb NOT NULL,
	"verdict" jsonb NOT NULL,
	"public_quote" jsonb NOT NULL,
	"executable" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobia_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_hash" text NOT NULL,
	"policy" jsonb NOT NULL,
	"snapshot" jsonb,
	"state" "cobia_request_state" DEFAULT 'open' NOT NULL,
	"selected_quote_id" text,
	"payment_receipt_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobia_quotes" ADD CONSTRAINT "cobia_quotes_request_id_cobia_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cobia_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobia_quotes_request_idx" ON "cobia_quotes" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_quotes_request_solver_idx" ON "cobia_quotes" USING btree ("request_id","solver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_requests_policy_hash_idx" ON "cobia_requests" USING btree ("policy_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_requests_payment_receipt_idx" ON "cobia_requests" USING btree ("payment_receipt_hash");--> statement-breakpoint
CREATE INDEX "cobia_requests_owner_idx" ON "cobia_requests" USING btree ("id");