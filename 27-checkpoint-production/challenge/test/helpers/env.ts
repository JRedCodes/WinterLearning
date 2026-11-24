import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import pg from "pg";
import request from "supertest";
import { createApp, type AppDeps } from "../../src/app.js";
import { loadConfig, type AppConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { createLogger } from "../../src/lib/logger.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREFIX = "wl:27:";

export function readProjectFile(rel: string): string {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`Expected ${rel} to exist in challenge/`);
  return readFileSync(p, "utf8");
}

/** Captures everything the app logs through the logger the tests inject. */
export class LogCapture {
  lines: string[] = [];
  write(chunk: string) {
    for (const line of chunk.split("\n")) if (line.trim()) this.lines.push(line);
  }
  get raw(): string {
    return this.lines.join("\n");
  }
  get entries(): Record<string, unknown>[] {
    return this.lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  }
  clear() {
    this.lines = [];
  }
}

export interface TestEnv {
  config: AppConfig;
  pool: pg.Pool;
  redis: Redis;
  logs: LogCapture;
  deps: (overrides?: Partial<AppDeps>) => AppDeps;
  app: (overrides?: Partial<AppDeps>) => ReturnType<typeof createApp>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function clearRedisPrefix(redis: Redis) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${PREFIX}*`, "COUNT", 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
}

export async function createTestEnv(env: Record<string, string> = {}): Promise<TestEnv> {
  const config = loadConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    LOG_LEVEL: "info",
    ...env,
  });
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
  const logs = new LogCapture();
  const logger = createLogger(config.logLevel, logs);

  const deps = (overrides: Partial<AppDeps> = {}): AppDeps => ({ config, pool, redis, logger, ...overrides });

  return {
    config,
    pool,
    redis,
    logs,
    deps,
    app: (overrides) => createApp(deps(overrides)),
    async reset() {
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      await migrate(pool, path.join(ROOT, "migrations"));
      await clearRedisPrefix(redis);
      logs.clear();
    },
    async close() {
      await clearRedisPrefix(redis);
      await pool.end();
      redis.disconnect();
    },
  };
}

type App = ReturnType<typeof createApp>;

export const PASSWORD = "correct horse battery staple";

export async function register(app: App, email: string, password = PASSWORD) {
  return request(app).post("/auth/register").send({ email, password });
}

/** Extracts `sid=<value>` from a Set-Cookie header. */
export function sessionCookie(res: request.Response): { cookie: string; sid: string; raw: string } | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const all = Array.isArray(header) ? header : header ? [header] : [];
  const raw = all.find((c) => c.startsWith("sid="));
  if (!raw) return undefined;
  const sid = raw.slice(4).split(";")[0]!;
  return { cookie: `sid=${sid}`, sid, raw };
}

/** Registers (ignoring "already exists") and logs in. Returns the Cookie header to send. */
export async function loginAs(app: App, email: string, password = PASSWORD) {
  await register(app, email, password);
  const res = await request(app).post("/auth/login").send({ email, password });
  const session = sessionCookie(res);
  if (res.status !== 200 || !session) {
    throw new Error(`login as ${email} failed: ${res.status} ${JSON.stringify(res.body)} (set-cookie: ${res.headers["set-cookie"]})`);
  }
  return { ...session, user: res.body.data as { id: string; email: string } };
}
