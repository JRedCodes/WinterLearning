import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type pg from "pg";
import type { QueryRecorder } from "../src/db/queryRecorder.js";
import { createInstrumentedApp, createTestPool } from "./helpers/db.js";
import { compactSql, describePlan, explain, seqScansOn } from "./helpers/plan.js";

let pool: pg.Pool;
let app: ReturnType<typeof createInstrumentedApp>["app"];
let recorder: QueryRecorder;

beforeAll(() => {
  pool = createTestPool();
  ({ app, recorder } = createInstrumentedApp(pool));
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(() => {
  recorder.reset();
});

/** EXPLAINs every query the last request ran; fails if any seq-scans the given tables. */
async function expectNoSeqScans(tables: string[]): Promise<void> {
  expect(recorder.queries.length).toBeGreaterThan(0);
  for (const q of recorder.queries) {
    const plan = await explain(pool, q);
    expect(
      seqScansOn(plan, tables).length,
      `Seq Scan on a big table for:\n${compactSql(q.text)}\n${describePlan(plan)}`,
    ).toBe(0);
  }
}

describe("GET /users/lookup?email=", () => {
  it("finds a user by email, case-insensitively", async () => {
    for (const email of ["user4242@example.com", "  USER4242@EXAMPLE.COM ", "User4242@Example.com"]) {
      const res = await request(app).get("/users/lookup").query({ email });
      expect(res.status, `lookup for ${JSON.stringify(email)}`).toBe(200);
      expect(res.body.data).toMatchObject({ handle: "user4242", email: "User4242@Example.com" });
    }
  });

  it("returns 404 for an unknown email", async () => {
    const res = await request(app).get("/users/lookup").query({ email: "nobody@example.com" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("uses an index instead of scanning all users", async () => {
    await request(app).get("/users/lookup").query({ email: "user77@example.com" });
    await expectNoSeqScans(["users"]);
  });
});

describe("GET /users/:id/posts", () => {
  it("returns the author's latest posts, newest first", async () => {
    const res = await request(app).get("/users/5/posts?limit=5");
    expect(res.status).toBe(200);
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM posts WHERE author_id = 5 ORDER BY created_at DESC, id DESC LIMIT 5",
    );
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(rows.map((r) => r.id));
    for (const post of res.body.data) {
      expect(post.authorId).toBe("5");
      expect(post.excerpt.length).toBeLessThanOrEqual(140);
    }
  });

  it("returns 404 for an unknown user", async () => {
    const res = await request(app).get("/users/999999999/posts");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("uses an index instead of scanning all posts", async () => {
    await request(app).get("/users/1234/posts?limit=20");
    await expectNoSeqScans(["posts", "users"]);
  });
});
