import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cobiaSchema } from "./schema";

export type CobiaDatabase = PostgresJsDatabase<typeof cobiaSchema>;

export function createDatabase(url: string): {
  db: CobiaDatabase;
  close: () => Promise<void>;
} {
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }

  const client = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60,
  });
  return {
    db: drizzle(client, { schema: cobiaSchema }),
    close: () => client.end(),
  };
}
