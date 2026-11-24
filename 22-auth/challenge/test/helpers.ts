import { Redis } from "ioredis";
import type pg from "pg";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { migrate } from "../src/db/migrations.js";
import { createPool } from "../src/db/pool.js";

export type App = ReturnType<typeof createApp>;

export interface TestContext {
  config: Config;
  pool: pg.Pool;
  redis: Redis;
  container: Container;
  app: App;
}

export const PASSWORD = "correct horse battery staple";

export async function connectTestRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    throw new Error(`Redis not reachable at ${url}: run \`make up\` first (${(err as Error).message})`);
  }
  return redis;
}

export async function flushPrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}

export async function createTestContext(): Promise<TestContext> {
  const config = { ...loadConfig({ ...process.env, NODE_ENV: "test" }), cookieSecure: false, sessionTtlSeconds: 3600 };
  const pool = createPool(config.databaseUrl);
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    await pool.end();
    throw new Error(`Postgres not reachable at ${config.databaseUrl}: run \`make up\` first (${(err as Error).message})`);
  }
  const redis = await connectTestRedis(config.redisUrl);
  const container = buildContainer({ pool, redis, config });
  return { config, pool, redis, container, app: createApp(container) };
}

/** Fresh schema + no wl:22: keys. Call in beforeEach. */
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(ctx.pool);
  await flushPrefix(ctx.redis, ctx.config.redisKeyPrefix);
}

export async function closeTestContext(ctx: TestContext | undefined): Promise<void> {
  if (!ctx) return;
  await flushPrefix(ctx.redis, ctx.config.redisKeyPrefix).catch(() => {});
  await Promise.allSettled([ctx.pool.end(), ctx.redis.quit()]);
}

/** Extracts "sid=<value>" from a response's Set-Cookie header (or undefined). */
export function sessionCookieFrom(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const sid = list.find((c) => c.startsWith("sid="));
  return sid?.split(";")[0];
}

export async function register(app: App, email: string, password = PASSWORD) {
  const res = await request(app).post("/auth/register").send({ email, password });
  expect(res.status, `register ${email} failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; email: string; role: string };
}

/** Logs in and returns the cookie to send back ("sid=..."). */
export async function login(app: App, email: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status, `login ${email} failed: ${JSON.stringify(res.body)}`).toBe(200);
  const cookie = sessionCookieFrom(res);
  expect(cookie, "login response must set the sid cookie").toBeDefined();
  return cookie!;
}

export async function registerAndLogin(app: App, email: string) {
  const user = await register(app, email);
  return { user, cookie: await login(app, email) };
}

/** Admins can't sign up through the API; create one directly, like a seed script would. */
export async function createAdmin(ctx: TestContext, email: string): Promise<string> {
  const { hashPassword } = await import("../src/lib/password.js");
  await ctx.container.users.create({ email, passwordHash: await hashPassword(PASSWORD), role: "admin" });
  return login(ctx.app, email);
}
