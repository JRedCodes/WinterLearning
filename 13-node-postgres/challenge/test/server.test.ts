import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { startServer } from "../src/server.js";
import { DATABASE_URL, MIGRATIONS_DIR, createTestPool, resetSchema } from "./helpers/db.js";

const APP_NAME = "wl13-server-test";
let pool: pg.Pool;

async function connectionsFromServer(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1",
    [APP_NAME],
  );
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  pool = createTestPool();
  await resetSchema(pool);
});
afterAll(async () => {
  await pool?.end();
});

describe("startServer composition root (TODO 6)", () => {
  it("migrates, serves from Postgres, and closes its pool on shutdown", async () => {
    const running = await startServer({
      port: 0,
      databaseUrl: DATABASE_URL,
      poolMax: 3,
      appName: APP_NAME,
      migrationsDir: MIGRATIONS_DIR,
    });
    let closed = false;
    try {
      const { rows: versions } = await pool
        .query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version")
        .catch(() => ({ rows: [] as { version: string }[] }));
      expect(versions.map((v) => v.version), "startServer must run migrations before listening").toEqual([
        "001_create_projects",
        "002_create_tasks",
      ]);

      const res = await fetch(`${running.url}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "From the real server" }),
      });
      expect(res.status).toBe(201);
      const { rows } = await pool.query("SELECT name FROM projects");
      expect(rows, "the project must be stored in Postgres, not in memory").toEqual([
        { name: "From the real server" },
      ]);
      expect(await connectionsFromServer()).toBeGreaterThan(0);

      await running.close();
      closed = true;

      // Backends disappear from pg_stat_activity shortly after the client disconnects.
      let remaining = await connectionsFromServer();
      for (let i = 0; i < 30 && remaining > 0; i++) {
        await new Promise((r) => setTimeout(r, 100));
        remaining = await connectionsFromServer();
      }
      expect(remaining, "close() must end the pg pool (pool.end())").toBe(0);
    } finally {
      if (!closed) await running.close();
    }
  });
});
