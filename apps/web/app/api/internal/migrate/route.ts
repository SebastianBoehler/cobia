import { createHash, timingSafeEqual } from "node:crypto";
import postgres from "postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const migration = {
  createdAt: 1_786_553_236_985,
  hash: "de8787a3d115f62984d4c32ccbc30bbf75eec6bdf890cd14afd54a9535d15652",
  sql: `
    ALTER TABLE "cobia_payments" DROP CONSTRAINT "cobia_payments_support_check";
    ALTER TABLE "cobia_payments" ADD CONSTRAINT "cobia_payments_support_check" CHECK (
      (("payment_chain_id" = 196
          AND lower("currency") = '0x779ded0c9e1022225f8e0630b35a9b54be713736')
        OR ("payment_chain_id" = 1952
          AND lower("currency") = '0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c'))
      AND "execution_chain_id" = 196
      AND "decimals" = 6 AND "amount_atomic" = '100000'
      AND "fee_payer" = true
    );
  `,
} as const;

function authorized(request: Request): boolean {
  const expected = process.env.COBIA_MIGRATION_TOKEN;
  const received = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return Response.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const result = await client.begin(async (sql) => {
      const [latest] = await sql<{ created_at: string }[]>`
        SELECT created_at FROM "drizzle"."__drizzle_migrations"
        ORDER BY created_at DESC LIMIT 1
      `;
      if (latest && Number(latest.created_at) >= migration.createdAt) return "current";
      await sql.unsafe(migration.sql);
      await sql`
        INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
        VALUES (${migration.hash}, ${migration.createdAt})
      `;
      return "applied";
    });
    return Response.json({ result });
  } finally {
    await client.end();
  }
}
