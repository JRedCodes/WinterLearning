import pg from "pg";

/** Creates this module's database (wl_25) if it doesn't exist yet. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_25");
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable on ${url.host}. Run \`make up\` first. (${(err as Error).message})`);
  }
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();
}
