import { z } from "zod";

/**
 * The only file that reads process.env. Everything else receives a typed Config.
 * This file is complete: you shouldn't need to change it (but you may add settings).
 */
const int = (def: number) => z.coerce.number().int().positive().default(def);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_36"),
  DB_POOL_MAX: int(10),

  REDIS_URL: z.string().min(1).default("redis://localhost:6380/4"),
  REDIS_KEY_PREFIX: z.string().min(1).default("wl:36:"),

  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("wl-36-ticketing"),
  KAFKA_TOPIC: z.string().min(1).default("ticketing.events"),

  SESSION_TTL_SECONDS: int(60 * 60 * 24),
  PASSWORD_SCRYPT_N: int(16_384).refine((n) => (n & (n - 1)) === 0, "must be a power of two"),
  ORGANIZER_EMAILS: z.string().default(""),

  HOLD_TTL_SECONDS: int(600),
  MAX_SEATS_PER_HOLD: int(6),

  CACHE_TTL_SECONDS: int(60),
  LOGIN_RATE_LIMIT: int(5),
  LOGIN_RATE_WINDOW_SECONDS: int(60),
  HOLD_RATE_LIMIT: int(10),
  HOLD_RATE_WINDOW_SECONDS: int(60),

  OUTBOX_BATCH_SIZE: int(100),
  OUTBOX_POLL_MS: int(500),
  HOLD_SWEEP_MS: int(5_000),
  NOTIFY_MAX_ATTEMPTS: int(5),
  NOTIFY_BACKOFF_MS: int(1_000),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  logLevel: string;
  databaseUrl: string;
  dbPoolMax: number;
  redisUrl: string;
  /** Every Redis key (cache, sessions, rate limits, pub/sub channels, BullMQ) starts with this. */
  redisKeyPrefix: string;
  kafka: { brokers: string[]; clientId: string; topic: string };
  auth: {
    sessionTtlSeconds: number;
    scryptN: number;
    /** Lower-cased. Registering with one of these emails gives the "organizer" role. */
    organizerEmails: string[];
  };
  holds: { ttlSeconds: number; maxSeatsPerHold: number };
  cache: { ttlSeconds: number };
  rateLimits: {
    login: { limit: number; windowSeconds: number };
    holds: { limit: number; windowSeconds: number };
  };
  outbox: { batchSize: number; pollMs: number };
  holdSweepMs: number;
  notifications: { maxAttempts: number; backoffMs: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    kafka: {
      brokers: e.KAFKA_BROKERS.split(",").map((b) => b.trim()).filter(Boolean),
      clientId: e.KAFKA_CLIENT_ID,
      topic: e.KAFKA_TOPIC,
    },
    auth: {
      sessionTtlSeconds: e.SESSION_TTL_SECONDS,
      scryptN: e.PASSWORD_SCRYPT_N,
      organizerEmails: e.ORGANIZER_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    },
    holds: { ttlSeconds: e.HOLD_TTL_SECONDS, maxSeatsPerHold: e.MAX_SEATS_PER_HOLD },
    cache: { ttlSeconds: e.CACHE_TTL_SECONDS },
    rateLimits: {
      login: { limit: e.LOGIN_RATE_LIMIT, windowSeconds: e.LOGIN_RATE_WINDOW_SECONDS },
      holds: { limit: e.HOLD_RATE_LIMIT, windowSeconds: e.HOLD_RATE_WINDOW_SECONDS },
    },
    outbox: { batchSize: e.OUTBOX_BATCH_SIZE, pollMs: e.OUTBOX_POLL_MS },
    holdSweepMs: e.HOLD_SWEEP_MS,
    notifications: { maxAttempts: e.NOTIFY_MAX_ATTEMPTS, backoffMs: e.NOTIFY_BACKOFF_MS },
  };
}
