import pg from "pg";

/** Creates the database named in `databaseUrl` if it doesn't exist yet (dev/test convenience). */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const db = decodeURIComponent(url.pathname.slice(1));
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable at ${url.host}: run \`make up\` first. (${String(err)})`);
  }
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${db.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }
}
