import pg from "pg";
import { loadConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { seedProducts } from "../../src/db/seed.js";

export function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: loadConfig().databaseUrl, max: 10 });
}

/** Fresh schema + migrations + the 3 demo products (ids 1, 2, 3). */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  await seedProducts(pool);
}
