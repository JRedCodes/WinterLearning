import { Redis } from "ioredis";
import pg from "pg";

/** Creates wl_31 if needed and fails early with a helpful message if a service is down. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_31");
  const db = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 3_000 });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`Postgres not reachable on ${url.host}. Run \`make up\` first. (${(err as Error).message})`);
  }
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380/15";
  const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3_000, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    throw new Error(`Redis not reachable at ${redisUrl}. Run \`make up\` first. (${(err as Error).message})`);
  } finally {
    redis.disconnect();
  }
}
