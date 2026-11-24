import { loadConfig } from "../config.js";
import { createPool } from "../lib/db.js";
import { migrate } from "./migrate.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL, 1);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply");
} finally {
  await pool.end();
}
