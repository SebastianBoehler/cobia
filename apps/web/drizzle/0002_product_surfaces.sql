CREATE TABLE "cobia_activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"chain_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"route_id" text,
	"transaction_hash" text,
	"detail" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobia_route_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"quote_id" text NOT NULL,
	"buyer" text NOT NULL,
	"chain_id" integer NOT NULL,
	"receipt_hash" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobia_route_purchases" ADD CONSTRAINT "cobia_route_purchases_request_id_cobia_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cobia_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobia_activity_events_wallet_idx" ON "cobia_activity_events" USING btree ("wallet","chain_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_route_purchases_quote_idx" ON "cobia_route_purchases" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_route_purchases_receipt_idx" ON "cobia_route_purchases" USING btree ("receipt_hash");--> statement-breakpoint
CREATE INDEX "cobia_route_purchases_buyer_idx" ON "cobia_route_purchases" USING btree ("buyer","chain_id");