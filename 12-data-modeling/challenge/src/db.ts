import pg from "pg";

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5433/wl_12";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export async function connect(url = databaseUrl()): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Postgres not reachable at ${redact(url)}. Run \`make up\` (or start Postgres on port 5433).\n` +
        `Cause: ${(err as Error).message}`,
    );
  }
  return client;
}

/** Create the module database if it doesn't exist yet. */
export async function ensureDatabase(url = databaseUrl()): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  target.pathname = "/postgres";
  const admin = await connect(target.toString());
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

/** Drop every object in `public` (tables, types, functions, extensions living there). */
export async function dropPublicSchema(client: pg.ClientBase): Promise<void> {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}
