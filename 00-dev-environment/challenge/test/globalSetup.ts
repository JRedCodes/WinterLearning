import pg from "pg";

/**
 * Makes sure the module's database (wl_00) exists before the integration test runs.
 * If Postgres isn't reachable we only warn: the unit tests (compose, Makefile, .gitignore,
 * checkServices with fakes) don't need it, and the integration test explains what to do.
 */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5433/wl_00");
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  } catch (err) {
    console.warn(
      `\n[globalSetup] Postgres not reachable on ${url.host} (${(err as Error).message}).\n` +
        "             Integration tests will fail. Start the services with `make up`.\n",
    );
  } finally {
    await admin.end().catch(() => {});
  }
}
