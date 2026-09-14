// Copied from kaaval/web/scripts/migrate.mts on 2026-09-14; edit there first.

import type { Db } from "../lib/tenant/db";
import { withDb } from "../lib/tenant/db";
import { migrate, readMigrations } from "../lib/tenant/migrate";

/**
 * Brings a database up to the current shape, and says what it did.
 *
 * With DATABASE_URL set it migrates that database. With nothing set it migrates an
 * embedded Postgres that lives in memory for the length of this command, which proves
 * the files apply cleanly on a machine that has no database yet. The second mode is why
 * this command is safe to run before anybody has signed up for anything.
 */

async function memoryDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  return {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]) {
      const result = await pg.query<T>(text, params as unknown[] | undefined);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const live = url !== undefined && url.trim() !== "";
  const files = readMigrations();
  console.log(`${String(files.length)} migration files found: ${files.map((file) => file.id).join(", ")}`);

  const applied = live ? await withDb((db) => migrate(db, files)) : await migrate(await memoryDb(), files);

  console.log(live ? "target: the database in DATABASE_URL" : "target: an embedded Postgres in memory, nothing is kept");
  if (applied.length === 0) console.log("applied: nothing, every migration was already in place");
  else console.log(`applied: ${applied.join(", ")}`);
}

main().then(
  async () => {
    const { closeDb } = await import("../lib/tenant/db");
    await closeDb();
    process.exit(0);
  },
  (error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
  },
);
