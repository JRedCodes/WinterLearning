import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import pg from "pg";
import { PermanentFetchError, type LinkMetadata, type MetadataFetcher, type System, type SystemOptions } from "../../src/contract.js";
import { createSystem } from "../../src/system.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_21";
// Database 5 = module id 21 mod 16.
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380/5";
export const KEY = "test-key-1";
export const OTHER_KEY = "test-key-2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fetcher you control: slow, failing N times, or failing permanently. */
export class FakeFetcher implements MetadataFetcher {
  calls: string[] = [];
  constructor(
    public opts: { delayMs?: number; failures?: number; permanent?: boolean } = {},
  ) {}

  async fetch(url: string): Promise<LinkMetadata> {
    this.calls.push(url);
    if (this.opts.delayMs) await sleep(this.opts.delayMs);
    if (this.opts.permanent) throw new PermanentFetchError("404 Not Found");
    if ((this.opts.failures ?? 0) > 0) {
      this.opts.failures = (this.opts.failures ?? 0) - 1;
      throw new Error("upstream timed out");
    }
    const host = new URL(url).hostname;
    return { title: `Title of ${host}`, description: `About ${host}`, imageUrl: `https://${host}/og.png` };
  }
}

/** A URL nobody else uses, so tests never see each other's previews. */
export function uniqueUrl(path = "article") {
  return `https://site-${randomUUID().slice(0, 8)}.test/${path}`;
}

export async function waitFor(check: () => Promise<boolean> | boolean, message: string, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${message}`);
}

export async function scanKeys(redis: Redis, prefix: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

export interface Running {
  system: System;
  fetcher: FakeFetcher;
  namespace: string;
  prefix: string;
  stop(): Promise<void>;
}

/** Starts a full system on a fresh namespace. `stop()` closes it and deletes its Redis keys. */
export async function start(
  overrides: Partial<SystemOptions> & { fetcher?: FakeFetcher; namespace?: string } = {},
): Promise<Running> {
  const fetcher = overrides.fetcher ?? new FakeFetcher();
  const namespace = overrides.namespace ?? `t${randomUUID().slice(0, 8)}`;
  const system = await createSystem({
    databaseUrl: DATABASE_URL,
    redisUrl: REDIS_URL,
    apiKeys: [KEY, OTHER_KEY],
    rateLimit: { limit: 1000, windowMs: 60_000 },
    cacheTtlSeconds: 60,
    jobs: { attempts: 3, backoffMs: 20 },
    ...overrides,
    namespace,
    fetcher,
  });
  const prefix = `wl:21:${namespace}:`;
  let stopped = false;
  return {
    system,
    fetcher,
    namespace,
    prefix,
    async stop() {
      if (stopped) return;
      stopped = true;
      await system.close();
      const redis = new Redis(REDIS_URL);
      const keys = await scanKeys(redis, prefix);
      if (keys.length) await redis.del(...keys);
      redis.disconnect();
    },
  };
}

/** Fresh schema once per test file; each system runs its own migrations. */
export async function resetDatabase() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable (${DATABASE_URL}), run \`make up\` first. (${String(err)})`);
  }
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();
}
