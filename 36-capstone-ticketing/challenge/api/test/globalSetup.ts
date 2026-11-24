import pg from "pg";

/** Creates the module's database (wl_36) once, if it doesn't exist yet. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_36");
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3_000 });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable on ${url.host}: run \`make up\` first (${(err as Error).message})`);
  }
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  } catch (err) {
    // Another process may have created it at the same moment.
    if ((err as { code?: string }).code !== "42P04") throw err;
  } finally {
    await admin.end();
  }
}
