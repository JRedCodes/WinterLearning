import pg from "pg";
import { loadConfig } from "../src/config.js";

/** Creates the wl_18 database once per test run if it doesn't exist. */
export default async function setup() {
  const url = new URL(loadConfig().databaseUrl);
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable on ${url.host}: run \`make up\` first (${(err as Error).message})`);
  }
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();
}
