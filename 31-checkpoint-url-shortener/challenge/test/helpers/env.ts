import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import pg from "pg";
import request from "supertest";
import { loadConfig, type AppConfig } from "../../src/config.js";
import { createContainer, type Container, type ContainerDeps } from "../../src/container.js";
import { migrate } from "../../src/db/migrate.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREFIX = "wl:31:";
export const ALICE = "key-alice";
export const BOB = "key-bob";
export const START = Date.parse("2026-03-10T12:00:00.000Z");

export function readProjectFile(rel: string): string {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`Expected ${rel} to exist in challenge/`);
  return readFileSync(p, "utf8");
}

/** A clock the tests control. `now` is what you pass as ContainerDeps.clock. */
export class FakeClock {
  constructor(private ms = START) {}
  now = (): Date => new Date(this.ms);
  advance(seconds: number) {
    this.ms += seconds * 1000;
  }
  set(iso: string) {
    this.ms = Date.parse(iso);
  }
}

/**
 * Counts every call your code makes on the pool (pool.query and pool.connect).
 * Used to prove the redirect path is served from the cache.
 */
export interface DbCounter {
  calls: number;
  reset(): void;
}

function instrument(pool: pg.Pool): DbCounter {
  const counter: DbCounter = {
    calls: 0,
    reset() {
      this.calls = 0;
    },
  };
  type AnyFn = (...args: unknown[]) => unknown;
  const target = pool as unknown as { query: AnyFn; connect: AnyFn };
  const realQuery = target.query.bind(pool) as AnyFn;
  const realConnect = target.connect.bind(pool) as AnyFn;
  target.query = (...args) => {
    counter.calls++;
    return realQuery(...args);
  };
  target.connect = (...args) => {
    counter.calls++;
    return realConnect(...args);
  };
  return counter;
}

export async function clearRedisPrefix(redis: Redis) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${PREFIX}*`, "COUNT", 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
}

export interface TestEnv {
  config: AppConfig;
  pool: pg.Pool;
  redis: Redis;
  clock: FakeClock;
  db: DbCounter;
  /** Builds a container (one "app instance"). Call it twice to simulate two instances. */
  build(overrides?: Partial<ContainerDeps>): Container;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestEnv(env: Record<string, string> = {}): Promise<TestEnv> {
  const config = loadConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_KEY_PREFIX: PREFIX,
    PUBLIC_BASE_URL: "https://sho.rt",
    API_KEYS: `${ALICE},${BOB}`,
    RATE_LIMIT_MAX: "1000",
    RATE_LIMIT_WINDOW_SECONDS: "60",
    ...env,
  });
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  const db = instrument(pool);
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
  const clock = new FakeClock();

  return {
    config,
    pool,
    redis,
    clock,
    db,
    build: (overrides = {}) => createContainer({ config, pool, redis, clock: clock.now, ...overrides }),
    async reset() {
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      await migrate(pool, path.join(ROOT, "migrations"));
      await clearRedisPrefix(redis);
      clock.set(new Date(START).toISOString());
      db.reset();
    },
    async close() {
      await clearRedisPrefix(redis);
      await pool.end();
      redis.disconnect();
    },
  };
}

type App = Container["app"];

export interface CreatedLink {
  code: string;
  shortUrl: string;
  url: string;
  createdAt: string;
  expiresAt: string | null;
}

/** POST /api/links and insist on a 201. */
export async function createLink(app: App, body: Record<string, unknown>, apiKey = ALICE): Promise<CreatedLink> {
  const res = await request(app).post("/api/links").set("X-API-Key", apiKey).send(body);
  if (res.status !== 201) {
    throw new Error(`POST /api/links ${JSON.stringify(body)} → expected 201, got ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data as CreatedLink;
}

/** GET /{code} without following the redirect. */
export function visit(app: App, code: string) {
  return request(app).get(`/${code}`).redirects(0);
}
