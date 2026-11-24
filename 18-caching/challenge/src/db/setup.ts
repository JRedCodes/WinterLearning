/**
 * `npm run db:setup`: create the database if needed, migrate, seed.
 * A separate step on purpose: the API server never migrates on startup.
 */
import pg from "pg";
import { loadConfig } from "../config.js";
import { migrate } from "./migrate.js";
import { seedProducts } from "./seed.js";

const { databaseUrl } = loadConfig();
const url = new URL(databaseUrl);
const dbName = url.pathname.slice(1);
url.pathname = "/postgres";

const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();

const pool = new pg.Pool({ connectionString: databaseUrl });
const applied = await migrate(pool);
await seedProducts(pool);
await pool.end();
console.log(`database ${dbName} ready (applied: ${applied.join(", ") || "nothing new"})`);
