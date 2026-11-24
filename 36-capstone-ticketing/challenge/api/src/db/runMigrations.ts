import { loadConfig } from "../config.js";
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";

/** `npm run migrate`: also what the Kubernetes migration Job runs. */
const config = loadConfig();
const pool = createPool({ connectionString: config.databaseUrl, max: 1 });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
} finally {
  await pool.end();
}
