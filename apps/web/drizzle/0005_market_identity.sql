CREATE TABLE "cobia_markets" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_chain_id" integer NOT NULL,
	"asset" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobia_markets_identity_check" CHECK (
		"execution_chain_id" = 196
		AND "asset" ~ '^0x[0-9a-f]{40}$'
		AND "id" = concat("execution_chain_id", ':', "asset")
	)
);
--> statement-breakpoint
INSERT INTO "cobia_markets" ("id", "execution_chain_id", "asset", "created_at")
SELECT
	concat(("policy"->>'executionChainId')::integer, ':', lower("policy"->>'asset')),
	("policy"->>'executionChainId')::integer,
	lower("policy"->>'asset'),
	min("created_at")
FROM "cobia_requests"
GROUP BY ("policy"->>'executionChainId')::integer, lower("policy"->>'asset');--> statement-breakpoint
ALTER TABLE "cobia_requests" ADD COLUMN "market_id" text;--> statement-breakpoint
UPDATE "cobia_requests"
SET "market_id" = concat(
	("policy"->>'executionChainId')::integer,
	':',
	lower("policy"->>'asset')
);--> statement-breakpoint
ALTER TABLE "cobia_requests" ALTER COLUMN "market_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cobia_requests" ADD CONSTRAINT "cobia_requests_market_identity_check" CHECK (
	"market_id" = concat(
		("policy"->>'executionChainId')::integer,
		':',
		lower("policy"->>'asset')
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX "cobia_markets_chain_asset_idx" ON "cobia_markets" USING btree ("execution_chain_id","asset");--> statement-breakpoint
ALTER TABLE "cobia_requests" ADD CONSTRAINT "cobia_requests_market_id_cobia_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."cobia_markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobia_requests_market_idx" ON "cobia_requests" USING btree ("market_id","created_at");
