import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { withTransaction, type TransactionPool } from "../src/db/transaction.js";
import { createTestPool } from "./helpers/db.js";

/** A fake client that records SQL and can be told to fail on a statement. */
function fakePool(failOn?: string) {
  const sql: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      sql.push(text.trim().toUpperCase());
      if (failOn && text.trim().toUpperCase() === failOn) throw new Error(`${failOn} failed`);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as TransactionPool;
  return { pool, client: client as typeof client & pg.PoolClient, sql };
}

describe("withTransaction with a fake pool (TODO 3)", () => {
  it("BEGINs, runs fn on the checked-out client, COMMITs and releases", async () => {
    const { pool, client, sql } = fakePool();
    const result = await withTransaction(pool, async (c) => {
      expect(c, "fn must receive the checked-out client").toBe(client);
      await c.query("SELECT 1");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(sql).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0]?.[0], "a healthy client is released without an error").toBeFalsy();
  });

  it("ROLLBACKs, releases and rethrows the original error when fn throws", async () => {
    const { pool, client, sql } = fakePool();
    const original = new Error("business rule violated");
    await expect(
      withTransaction(pool, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(sql).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the client when COMMIT fails, and rejects", async () => {
    const { pool, client } = fakePool("COMMIT");
    await expect(withTransaction(pool, async () => "never committed")).rejects.toThrow("COMMIT failed");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("destroys the client (release with an error) when ROLLBACK fails, but rethrows the ORIGINAL error", async () => {
    const { pool, client } = fakePool("ROLLBACK");
    const original = new Error("original problem");
    await expect(
      withTransaction(pool, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(
      client.release.mock.calls[0]?.[0],
      "pass the rollback error (or true) to release() so the pool discards the broken connection",
    ).toBeTruthy();
  });
});

describe("withTransaction against real Postgres (TODO 3)", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = createTestPool({ max: 1 }); // one connection: any leak hangs the next test
    await pool.query("DROP TABLE IF EXISTS tx_probe; CREATE TABLE tx_probe (n int)");
  });
  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS tx_probe");
    await pool.end();
  });

  it("commits and rolls back for real", async () => {
    await withTransaction(pool, (c) => c.query("INSERT INTO tx_probe VALUES (1)"));
    await expect(
      withTransaction(pool, async (c) => {
        await c.query("INSERT INTO tx_probe VALUES (2)");
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    const { rows } = await pool.query<{ n: number }>("SELECT n FROM tx_probe ORDER BY n");
    expect(rows.map((r) => r.n)).toEqual([1]);
  });

  it("leaves the connection usable after a failed statement inside the transaction", async () => {
    await expect(
      withTransaction(pool, async (c) => {
        await c.query("SELECT 1/0");
      }),
    ).rejects.toThrow(/division by zero/);
    // If the aborted transaction wasn't rolled back, this would fail with
    // "current transaction is aborted".
    const { rows } = await pool.query<{ ok: number }>("SELECT 1 AS ok");
    expect(rows[0]?.ok).toBe(1);
  });
});
