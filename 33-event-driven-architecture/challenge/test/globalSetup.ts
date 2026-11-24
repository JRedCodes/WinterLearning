import pg from "pg";

export const DEFAULT_URL = "postgres://postgres:postgres@localhost:5433/wl_33";

/** Creates the module's database (wl_33) if it doesn't exist yet. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable on ${url.host}. Run \`make up\` first. (${(err as Error).message})`);
  }
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  } finally {
    await admin.end();
  }
}
