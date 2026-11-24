import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type pg from "pg";
import type { QueryRecorder } from "../src/db/queryRecorder.js";
import { createInstrumentedApp, createTestPool } from "./helpers/db.js";
import { compactSql, describePlan, explain, rowsReadFrom } from "./helpers/plan.js";

interface FeedItemJson {
  id: string;
  excerpt: string;
  createdAt: string;
  author: { id: string; handle: string; displayName: string };
  commentCount: number;
}

interface ExpectedItem {
  id: string;
  author_id: string;
  handle: string;
  display_name: string;
  excerpt: string;
  comment_count: number;
}

let pool: pg.Pool;
let app: ReturnType<typeof createInstrumentedApp>["app"];
let recorder: QueryRecorder;

/** Ground truth, computed independently of your code. */
async function expectedFeed(limit: number, offset = 0): Promise<ExpectedItem[]> {
  const { rows } = await pool.query<ExpectedItem>(
    `SELECT p.id, u.id AS author_id, u.handle, u.display_name, left(p.body, 140) AS excerpt,
            (SELECT count(*) FROM comments c WHERE c.post_id = p.id)::int AS comment_count
       FROM posts p JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

async function getFeed(query: Record<string, string | number>) {
  const res = await request(app).get("/feed").query(query);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { data: FeedItemJson[]; nextCursor: string | null };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

function queryLog(): string {
  return recorder.queries.map((q, i) => `  ${i + 1}. ${compactSql(q.text).slice(0, 140)}`).join("\n");
}

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

describe("GET /feed: behaviour", () => {
  it("returns the newest posts with author and comment count", async () => {
    const body = await getFeed({ limit: 20 });
    const expected = await expectedFeed(20);

    expect(ids(body.data)).toEqual(ids(expected));
    body.data.forEach((item, i) => {
      const e = expected[i]!;
      expect(item).toMatchObject({
        id: e.id,
        excerpt: e.excerpt,
        author: { id: e.author_id, handle: e.handle, displayName: e.display_name },
        commentCount: e.comment_count,
      });
      expect(Date.parse(item.createdAt)).not.toBeNaN();
    });
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it("validates limit and cursor", async () => {
    expect((await request(app).get("/feed?limit=0")).status).toBe(400);
    expect((await request(app).get("/feed?limit=101")).status).toBe(400);
    const bad = await request(app).get("/feed").query({ cursor: "definitely-not-a-cursor" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CURSOR");
  });

  it("pages through posts with identical timestamps without skipping or repeating any", async () => {
    // Seed posts share created_at in groups of 3, and 7 isn't a multiple of 3,
    // so page boundaries fall in the middle of ties.
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const body = await getFeed(cursor ? { limit: 7, cursor } : { limit: 7 });
      seen.push(...ids(body.data));
      cursor = body.nextCursor;
    }
    expect(seen).toEqual(ids(await expectedFeed(35)));
  });
});

describe("GET /feed: performance", () => {
  it("uses a constant number of queries, not one per post (at most 3)", async () => {
    for (const limit of [20, 50]) {
      recorder.reset();
      await getFeed({ limit });
      expect(
        recorder.queries.length,
        `GET /feed?limit=${limit} ran ${recorder.queries.length} queries:\n${queryLog()}`,
      ).toBeLessThanOrEqual(3);
    }
  });

  it("never pulls full post bodies for the list (only excerpts)", async () => {
    await getFeed({ limit: 20 });
    const heavy = recorder.queries.filter((q) => q.fields.includes("body"));
    expect(
      heavy.map((q) => compactSql(q.text)),
      "these queries returned the full `body` column; the feed only needs a 140-char excerpt",
    ).toEqual([]);
  });

  it("does not repeat posts when new ones are published between page loads", async () => {
    const expected = await expectedFeed(20);
    const page1 = await getFeed({ limit: 10 });

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO posts (author_id, body) VALUES (1, 'breaking news: a brand new post') RETURNING id",
    );
    try {
      const page2 = await getFeed({ limit: 10, cursor: page1.nextCursor! });
      const all = [...ids(page1.data), ...ids(page2.data)];
      expect(new Set(all).size, `duplicate posts across pages: ${all.join(",")}`).toBe(all.length);
      expect(ids(page2.data), "page 2 must continue exactly where page 1 ended").toEqual(
        ids(expected.slice(10, 20)),
      );
    } finally {
      await pool.query("DELETE FROM posts WHERE id = $1", [rows[0]!.id]);
    }
  });

  it("does the same small amount of work on page 31 as on page 1", async () => {
    let cursor: string | null = null;
    for (let page = 0; page < 30; page++) {
      cursor = (await getFeed(cursor ? { limit: 100, cursor } : { limit: 100 })).nextCursor;
    }
    recorder.reset();
    const deep = await getFeed({ limit: 100, cursor: cursor! });
    expect(ids(deep.data), "page 31 content").toEqual(ids(await expectedFeed(100, 3000)));

    const postQueries = recorder.queries.filter((q) => /\bposts\b/i.test(q.text));
    expect(postQueries.length).toBeGreaterThan(0);
    for (const q of postQueries) {
      const plan = await explain(pool, q, { analyze: true });
      const read = rowsReadFrom(plan, "posts");
      expect(
        read,
        `reading page 31 scanned ${read} rows of posts to return 100:\n${compactSql(q.text)}\n${describePlan(plan)}`,
      ).toBeLessThanOrEqual(300);
    }
  });
});

describe("GET /posts/:id", () => {
  it("returns the full post with author and comment count", async () => {
    const [first] = await expectedFeed(1);
    const res = await request(app).get(`/posts/${first!.id}`);
    expect(res.status).toBe(200);
    const { rows } = await pool.query<{ body: string }>("SELECT body FROM posts WHERE id = $1", [first!.id]);
    expect(res.body.data).toMatchObject({
      id: first!.id,
      body: rows[0]!.body,
      author: { id: first!.author_id, handle: first!.handle },
      commentCount: first!.comment_count,
    });
  });

  it("returns 404 for a missing post", async () => {
    const res = await request(app).get("/posts/999999999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("POST_NOT_FOUND");
  });
});
