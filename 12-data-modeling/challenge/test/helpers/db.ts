import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import type pg from "pg";
import { connect, dropPublicSchema } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";

export const migrationsDir = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** SQLSTATE codes you'll see in this module. */
export const PG = {
  NOT_NULL: "23502",
  FOREIGN_KEY: "23503",
  UNIQUE: "23505",
  CHECK: "23514",
  EXCLUSION: "23P01",
  INVALID_TEXT: "22P02", // e.g. 'superadmin' is not a value of an enum type
} as const;

/** Drop everything, apply all migrations from scratch, return a connected client. */
export async function freshDatabase(): Promise<pg.Client> {
  const client = await connect();
  await dropPublicSchema(client);
  await migrate(client, migrationsDir);
  return client;
}

/** Empty every table (except schema_migrations) between tests. */
export async function truncateAll(client: pg.Client): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Assert that a statement is rejected by the database with one of the given SQLSTATE codes.
 * The whole point of this module: invalid data must be impossible to store.
 */
export async function expectRejected(
  client: pg.Client,
  what: string,
  sql: string,
  params: unknown[],
  codes: string | string[],
): Promise<void> {
  const allowed = Array.isArray(codes) ? codes : [codes];
  let error: { code?: string; message?: string } | undefined;
  try {
    await client.query(sql, params);
  } catch (err) {
    error = err as { code?: string; message?: string };
  }
  expect(
    error,
    `${what}: expected the database to REJECT this with SQLSTATE ${allowed.join(" or ")}, but it was accepted.\n  SQL: ${sql}`,
  ).toBeDefined();
  expect(
    allowed.includes(error?.code ?? ""),
    `${what}: expected SQLSTATE ${allowed.join(" or ")}, got ${error?.code}: ${error?.message}`,
  ).toBe(true);
}

/** Assert that a statement succeeds, with a readable message if it doesn't. */
export async function expectAccepted(
  client: pg.Client,
  what: string,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  try {
    return await client.query(sql, params);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    throw new Error(`${what}: expected this to be ACCEPTED, but got ${e.code}: ${e.message}\n  SQL: ${sql}`);
  }
}

// ---- tiny factories: insert valid rows, return their ids -------------------------

let seq = 0;
const next = () => ++seq;

export type Id = string; // bigint comes back as a string from pg; uuid is a string too

export async function createOrg(client: pg.Client, slug = `org-${next()}`): Promise<Id> {
  const { rows } = await client.query<{ id: Id }>(
    "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
    [`Org ${slug}`, slug],
  );
  return rows[0]!.id;
}

export async function createUser(client: pg.Client, email = `user${next()}@example.com`): Promise<Id> {
  const { rows } = await client.query<{ id: Id }>(
    "INSERT INTO users (email, full_name) VALUES ($1, $2) RETURNING id",
    [email, `User ${email}`],
  );
  return rows[0]!.id;
}

export async function addMember(client: pg.Client, orgId: Id, userId: Id, role?: string): Promise<void> {
  if (role === undefined) {
    await client.query("INSERT INTO memberships (organization_id, user_id) VALUES ($1, $2)", [orgId, userId]);
  } else {
    await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)", [
      orgId,
      userId,
      role,
    ]);
  }
}

export async function createRoom(
  client: pg.Client,
  orgId: Id,
  name = `Room ${next()}`,
  capacity = 8,
): Promise<Id> {
  const { rows } = await client.query<{ id: Id }>(
    "INSERT INTO rooms (organization_id, name, capacity) VALUES ($1, $2, $3) RETURNING id",
    [orgId, name, capacity],
  );
  return rows[0]!.id;
}

export async function createBooking(
  client: pg.Client,
  roomId: Id,
  organizerId: Id,
  startsAt: string,
  endsAt: string,
  status?: "confirmed" | "cancelled",
): Promise<Id> {
  const { rows } = await client.query<{ id: Id }>(
    status === undefined
      ? "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at) VALUES ($1, $2, 'Sync', $3, $4) RETURNING id"
      : "INSERT INTO bookings (room_id, organizer_id, title, starts_at, ends_at, status) VALUES ($1, $2, 'Sync', $3, $4, $5) RETURNING id",
    status === undefined ? [roomId, organizerId, startsAt, endsAt] : [roomId, organizerId, startsAt, endsAt, status],
  );
  return rows[0]!.id;
}

export async function count(client: pg.Client, table: string, where = "true", params: unknown[] = []) {
  const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params);
  return rows[0]!.n;
}
