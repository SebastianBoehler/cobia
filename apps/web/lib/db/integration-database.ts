import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client";

const POSTGRES_IMAGE = "postgres:16-alpine";
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type Database = ReturnType<typeof createDatabase>;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsFolder))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
}

async function applySqlMigration(database: Database, tag: string): Promise<void> {
  const file = `${tag}.sql`;
  if (!(await migrationFiles()).includes(file)) throw new Error(`Unknown migration ${tag}`);
  const source = await readFile(`${migrationsFolder}/${file}`, "utf8");
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await database.db.execute(sql.raw(statement));
  }
}

async function closeResources(
  database: Database | undefined,
  container: StartedPostgreSqlContainer | undefined,
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await database?.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    await container?.stop();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) throw new AggregateError(errors, "Failed to close integration database");
}

export async function startIntegrationDatabase(options: {
  throughMigration?: string;
} = {}) {
  let container: StartedPostgreSqlContainer | undefined;
  let database: Database | undefined;
  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    database = createDatabase(container.getConnectionUri());
    if (options.throughMigration) {
      const files = await migrationFiles();
      const target = `${options.throughMigration}.sql`;
      const targetIndex = files.indexOf(target);
      if (targetIndex < 0) throw new Error(`Unknown migration ${options.throughMigration}`);
      for (const file of files.slice(0, targetIndex + 1)) {
        await applySqlMigration(database, file.slice(0, -4));
      }
    } else {
      await migrate(database.db, { migrationsFolder });
    }
  } catch (startupError) {
    try {
      await closeResources(database, container);
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "Integration database startup and cleanup failed",
      );
    }
    throw startupError;
  }

  let closed = false;
  return {
    db: database.db,
    applyMigration: (tag: string) => applySqlMigration(database, tag),
    async close(): Promise<void> {
      if (closed) return;
      await closeResources(database, container);
      closed = true;
    },
  };
}
