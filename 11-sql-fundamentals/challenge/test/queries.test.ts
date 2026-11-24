import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect } from "../src/db.js";
import { readExercise, runQuery, stripComments, type QueryResult } from "../src/exercises.js";

interface Expected extends QueryResult {
  /** true when the prompt demands an ORDER BY, so row order is part of the answer */
  ordered: boolean;
}

const expectedDir = new URL("./expected/", import.meta.url);
const exercises = readdirSync(expectedDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    file: f.replace(/\.json$/, ".sql"),
    expected: JSON.parse(readFileSync(new URL(f, expectedDir), "utf8")) as Expected,
  }));

/** Statements that change data instead of reading it. */
const WRITE_EXERCISES = new Set(["23_upsert_reviews.sql", "24_update_returning.sql"]);

const sortRows = (rows: (string | null)[][]) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function table(columns: string[], rows: (string | null)[][]): string {
  const lines = [columns.join(" | "), ...rows.map((r) => r.map((v) => v ?? "NULL").join(" | "))];
  return lines.map((l) => `    ${l}`).join("\n");
}

let client: pg.Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

/** Runs `fn` in a transaction that is always rolled back, so no exercise can affect another. */
async function inRollback<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

describe("SQL exercises", () => {
  it.each(exercises)("$file", async ({ file, expected }) => {
    const sql = await readExercise(file);
    const body = stripComments(sql);
    expect(body, `${file}: no query written yet. Write your SQL below the comment.`).not.toBe("");

    if (!WRITE_EXERCISES.has(file)) {
      expect(
        /\bvalues\b/i.test(body),
        `${file}: answer with a query over the tables, not hard-coded VALUES.`,
      ).toBe(false);
    }

    const actual = await inRollback(async () => {
      try {
        return await runQuery(client, sql);
      } catch (err) {
        throw new Error(`${file}: Postgres rejected the query: ${(err as Error).message}`);
      }
    });

    expect(actual.columns, `${file}: wrong columns (names and order matter; use AS aliases)`).toEqual(
      expected.columns,
    );

    const hint =
      `${file}: rows differ.\n  expected (${expected.rows.length} rows${expected.ordered ? ", in this order" : ", any order"}):\n` +
      `${table(expected.columns, expected.rows)}\n  got (${actual.rows.length} rows):\n${table(actual.columns, actual.rows)}\n`;

    if (expected.ordered) {
      expect(actual.rows, hint).toEqual(expected.rows);
    } else {
      expect(sortRows(actual.rows), hint).toEqual(sortRows(expected.rows));
    }
  });
});

describe("side effects of the write exercises", () => {
  it("23: the upsert updates one existing review and inserts one new review", async () => {
    const sql = await readExercise("23_upsert_reviews.sql");
    expect(stripComments(sql), "23: no query written yet").not.toBe("");

    await inRollback(async () => {
      // (values come back as raw text in this module, hence Number())
      const before = await client.query("SELECT count(*) AS n FROM reviews");
      await client.query(sql);
      const after = await client.query("SELECT count(*) AS n FROM reviews");
      expect(Number(after.rows[0].n), "exactly one new review should exist").toBe(
        Number(before.rows[0].n) + 1,
      );

      const updated = await client.query(
        "SELECT rating, body, created_at > '2026-03-25 18:00:00+00' AS refreshed FROM reviews WHERE product_id = 11 AND customer_id = 3",
      );
      expect(updated.rows, "customer 3 must still have exactly one review of product 11").toHaveLength(1);
      expect(updated.rows[0]).toEqual({ rating: "2", body: "Squeaks after a month.", refreshed: "t" });
    });
  });

  it("24: only active Furniture products get the 10% increase", async () => {
    const sql = await readExercise("24_update_returning.sql");
    expect(stripComments(sql), "24: no query written yet").not.toBe("");

    await inRollback(async () => {
      const snapshot = "SELECT id, price FROM products ORDER BY id";
      const before = (await client.query(snapshot)).rows as { id: string; price: string }[];
      await client.query(sql);
      const after = (await client.query(snapshot)).rows as { id: string; price: string }[];

      const changed = after.filter((row, i) => row.price !== before[i]?.price);
      expect(changed, "exactly products 10 and 11 should change").toEqual([
        { id: "10", price: "603.90" },
        { id: "11", price: "328.90" },
      ]);
    });
  });
});
