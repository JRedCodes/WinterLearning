import { z } from "zod";

/**
 * The ONLY file that reads process.env. Already complete: every setting you need for the
 * hardening work is here (some aren't used by the bare app yet).
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_27"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380/11"),
  REDIS_KEY_PREFIX: z.string().min(1).default("wl:27:"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  COOKIE_SECURE: bool.default(false),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  TRUST_PROXY: bool.default(false),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MIGRATIONS_DIR: z.string().min(1).default("migrations"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Prefix for EVERY Redis key this app writes, e.g. "wl:27:" -> "wl:27:sess:<id>". */
  redisKeyPrefix: string;
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  loginRateLimit: { max: number; windowSeconds: number };
  trustProxy: boolean;
  shutdownTimeoutMs: number;
  migrationsDir: string;
  logLevel: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    sessionTtlSeconds: e.SESSION_TTL_SECONDS,
    cookieSecure: e.COOKIE_SECURE,
    loginRateLimit: { max: e.LOGIN_RATE_LIMIT_MAX, windowSeconds: e.LOGIN_RATE_LIMIT_WINDOW_SECONDS },
    trustProxy: e.TRUST_PROXY,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    migrationsDir: e.MIGRATIONS_DIR,
    logLevel: e.LOG_LEVEL,
  };
}
