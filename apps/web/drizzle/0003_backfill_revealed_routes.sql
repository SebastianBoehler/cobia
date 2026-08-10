INSERT INTO "cobia_route_purchases" (
  "id", "request_id", "quote_id", "buyer", "chain_id", "receipt_hash", "bundle", "purchased_at"
)
SELECT
  quotes."id",
  requests."id",
  quotes."id",
  lower(requests."policy"->>'owner'),
  196,
  requests."payment_receipt_hash",
  quotes."private_bundle",
  requests."updated_at"
FROM "cobia_requests" requests
JOIN "cobia_quotes" quotes ON quotes."id" = requests."selected_quote_id"
WHERE requests."state" IN ('paid', 'revealed')
  AND requests."payment_receipt_hash" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "cobia_activity_events" (
  "id", "wallet", "chain_id", "kind", "status", "route_id", "detail", "occurred_at"
)
SELECT
  (
    substr(md5(requests."id"::text || ':route_revealed'), 1, 8) || '-' ||
    substr(md5(requests."id"::text || ':route_revealed'), 9, 4) || '-' ||
    substr(md5(requests."id"::text || ':route_revealed'), 13, 4) || '-' ||
    substr(md5(requests."id"::text || ':route_revealed'), 17, 4) || '-' ||
    substr(md5(requests."id"::text || ':route_revealed'), 21, 12)
  )::uuid,
  lower(requests."policy"->>'owner'),
  196,
  'route_revealed',
  'confirmed',
  requests."selected_quote_id",
  jsonb_build_object(
    'quoteId', requests."selected_quote_id",
    'receiptHash', requests."payment_receipt_hash",
    'backfilled', true
  ),
  requests."updated_at"
FROM "cobia_requests" requests
WHERE requests."state" IN ('paid', 'revealed')
  AND requests."payment_receipt_hash" IS NOT NULL
  AND requests."selected_quote_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
