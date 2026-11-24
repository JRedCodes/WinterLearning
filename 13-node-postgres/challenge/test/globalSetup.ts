import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_13";

/**
 * Runs once before all test files: makes sure the wl_13 database exists.
 * (Each test file then resets the schema it needs.)
 * Returns a teardown that leaves the database empty, so `npm run dev`
 * afterwards migrates from scratch instead of tripping over test tables.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = new URL(DATABASE_URL);
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3_000 });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Postgres not reachable at ${url.host}. Run \`make up\` first. (${(err as Error).message})`,
    );
  }
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  } finally {
    await admin.end();
  }

  return async () => {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    } finally {
      await client.end();
    }
  };
}
