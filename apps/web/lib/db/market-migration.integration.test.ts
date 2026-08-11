import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";

describe("market identity migration", () => {
  it("can stage a disposable database at payment-saga schema", async () => {
    const database = await startIntegrationDatabase({ throughMigration: "0004_payment_saga" });
    try {
      const columns = await database.db.execute(sql<{ market_id_exists: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cobia_requests'
            AND column_name = 'market_id'
        ) AS market_id_exists
      `);
      expect(columns[0]?.market_id_exists).toBe(false);
      expect(database.applyMigration).toEqual(expect.any(Function));
    } finally {
      await database.close();
    }
  });

  it("backfills same-asset attempts without changing a paid purchase", async () => {
    const database = await startIntegrationDatabase({ throughMigration: "0004_payment_saga" });
    const firstId = "11111111-1111-4111-8111-111111111111";
    const secondId = "22222222-2222-4222-8222-222222222222";
    const quoteId = `0x${"ab".repeat(32)}`;
    const asset = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
    const policy = (requestId: string) => JSON.stringify({
      version: 1,
      requestId,
      owner: "0x1111111111111111111111111111111111111111",
      executionChainId: 196,
      asset,
      principalAtomic: "25000000",
      maxProtocolExposureBps: 4_000,
      minTvlUsdE6: "1000000",
      minPreGasApyBps: 0,
      maxSnapshotAgeSec: 300,
      deadline: 2_000_000_000,
      noBridges: true,
    });
    try {
      await database.db.execute(sql`
        INSERT INTO cobia_requests
          (id, policy_hash, policy, state, selected_quote_id, payment_receipt_hash)
        VALUES
          (${firstId}::uuid, 'policy-1', ${policy(firstId)}::jsonb, 'revealed', ${quoteId}, 'receipt-1'),
          (${secondId}::uuid, 'policy-2', ${policy(secondId)}::jsonb, 'quotes_ready', NULL, NULL)
      `);
      await database.db.execute(sql`
        INSERT INTO cobia_quotes
          (id, request_id, solver_id, private_bundle, verdict, public_quote, executable)
        VALUES
          (${quoteId}, ${firstId}::uuid, 'deterministic', '{}'::jsonb, '{}'::jsonb,
            '{}'::jsonb, true)
      `);
      await database.db.execute(sql`
        INSERT INTO cobia_route_purchases
          (id, request_id, quote_id, buyer, chain_id, payment_chain_id, receipt_hash, bundle)
        VALUES
          ('paid-route', ${firstId}::uuid, ${quoteId},
            '0x1111111111111111111111111111111111111111', 196, 1952,
            'receipt-1', '{"paid":true}'::jsonb)
      `);

      await database.applyMigration("0005_market_identity");

      const rows = await database.db.execute(sql<{
        market_count: number;
        request_count: number;
        purchase_count: number;
        paid_bundle: boolean;
      }>`
        SELECT
          (SELECT count(*)::int FROM cobia_markets) AS market_count,
          (SELECT count(*)::int FROM cobia_requests
            WHERE market_id = ${`196:${asset}`}) AS request_count,
          (SELECT count(*)::int FROM cobia_route_purchases
            WHERE id = 'paid-route' AND request_id = ${firstId}::uuid
              AND quote_id = ${quoteId} AND receipt_hash = 'receipt-1') AS purchase_count,
          (SELECT bundle->>'paid' = 'true' FROM cobia_route_purchases
            WHERE id = 'paid-route') AS paid_bundle
      `);
      expect(rows[0]).toEqual({
        market_count: 1,
        request_count: 2,
        purchase_count: 1,
        paid_bundle: true,
      });
    } finally {
      await database.close();
    }
  });
});
