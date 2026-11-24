import pg from "pg";
import { migrate } from "../../src/db/migrate.js";
import { projectPath } from "./files.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_26";

/** Fresh schema + migrations. Call in beforeAll; end the pool in afterAll. */
export async function freshDatabase(): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool, projectPath("migrations"));
  return pool;
}
