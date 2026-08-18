ALTER TABLE "cobia_requests" DROP CONSTRAINT "cobia_requests_market_identity_check";--> statement-breakpoint
ALTER TABLE "cobia_requests" ADD CONSTRAINT "cobia_requests_market_identity_check" CHECK (
  "cobia_requests"."market_id" = concat(
    ("cobia_requests"."policy"->>'executionChainId')::integer,
    ':',
    lower(coalesce(
      "cobia_requests"."policy"->>'asset',
      "cobia_requests"."policy"->'input'->>'token'
    ))
  )
);--> statement-breakpoint
