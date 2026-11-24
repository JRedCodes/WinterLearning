import { z } from "zod";

/**
 * The ONLY file that reads process.env (an architecture test enforces this).
 * Provided complete so that the tests and you agree on setting names. Add settings if you need them.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_31"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380/15"),
  REDIS_KEY_PREFIX: z.string().min(1).default("wl:31:"),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  API_KEYS: z.string().min(1).default("dev-key-1,dev-key-2"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  CLICK_DRAIN_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  MIGRATIONS_DIR: z.string().min(1).default("migrations"),
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Prefix for EVERY Redis key this app writes, e.g. "wl:31:" -> "wl:31:link:aZ3kP9q". */
  redisKeyPrefix: string;
  /** Base for shortUrl in responses, without a trailing slash: `${publicBaseUrl}/${code}`. */
  publicBaseUrl: string;
  /** API keys accepted in the X-API-Key header. */
  apiKeys: string[];
  /** Link creation limit per API key. */
  rateLimit: { max: number; windowSeconds: number };
  cacheTtlSeconds: number;
  clickDrainIntervalMs: number;
  migrationsDir: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  const apiKeys = e.API_KEYS.split(",").map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) throw new Error("Invalid environment configuration:\n  - API_KEYS: at least one key is required");
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    publicBaseUrl: e.PUBLIC_BASE_URL.replace(/\/+$/, ""),
    apiKeys,
    rateLimit: { max: e.RATE_LIMIT_MAX, windowSeconds: e.RATE_LIMIT_WINDOW_SECONDS },
    cacheTtlSeconds: e.CACHE_TTL_SECONDS,
    clickDrainIntervalMs: e.CLICK_DRAIN_INTERVAL_MS,
    migrationsDir: e.MIGRATIONS_DIR,
  };
}
