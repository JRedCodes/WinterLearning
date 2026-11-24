import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5433/wl_11";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

const sqlDir = fileURLToPath(new URL("../sql/", import.meta.url));

/**
 * Return every column as the exact text Postgres sends, instead of letting `pg`
 * convert it (numeric → string, timestamptz → Date, int8 → string...).
 * That makes results easy to compare and print. Module 13 covers type parsing properly.
 */
const rawText = { getTypeParser: () => (value: string) => value } as unknown as pg.CustomTypesConfig;

/** A client with deterministic settings: UTC time zone and raw-text values. */
export async function connect(url = databaseUrl()): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, types: rawText });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Postgres not reachable at ${redact(url)}. Run \`make up\` (or start Postgres on port 5433).\n` +
        `Cause: ${(err as Error).message}`,
    );
  }
  await client.query("SET TIME ZONE 'UTC'");
  return client;
}

/**
 * Make sure the module database exists. It is created with the "C" collation so that
 * ORDER BY on text gives the same order on every machine (macOS, Linux, Alpine...).
 */
export async function ensureDatabase(url = databaseUrl()): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  target.pathname = "/postgres";
  const admin = await connect(target.toString());
  try {
    const { rows } = await admin.query<{ datcollate: string }>(
      "SELECT datcollate FROM pg_database WHERE datname = $1",
      [name],
    );
    if (rows[0] && rows[0].datcollate !== "C") {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    if (!rows[0] || rows[0].datcollate !== "C") {
      await admin.query(
        `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
    }
  } finally {
    await admin.end();
  }
}

/** Drop everything in `public` and load the Shopfront schema + seed data. */
export async function loadDataset(client: pg.Client): Promise<void> {
  const schema = await readFile(`${sqlDir}schema.sql`, "utf8");
  const seed = await readFile(`${sqlDir}seed.sql`, "utf8");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.query(schema);
  await client.query(seed);
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
