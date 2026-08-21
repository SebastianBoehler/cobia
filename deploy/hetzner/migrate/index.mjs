import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATION_LOCK_ID = 430_624_196;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgres://") && !databaseUrl?.startsWith("postgresql://")) {
  throw new Error("DATABASE_URL must be a PostgreSQL URL");
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
});

try {
  await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../../../apps/web/drizzle", import.meta.url)),
  });
} finally {
  await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
  await client.end({ timeout: 5 });
}
