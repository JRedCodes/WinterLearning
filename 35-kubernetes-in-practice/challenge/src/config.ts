import { z } from "zod";

/**
 * The ONLY file that reads process.env.
 *
 * In Kubernetes these variables are injected by the Deployment: non-secret values from a
 * ConfigMap, DB_PASSWORD from a Secret. The tests import `EnvSchema` to check that every
 * variable your manifests set is one this app actually reads (a typo like DB_HOSTNAME would
 * otherwise be silently ignored and the app would fall back to the localhost default).
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_VERSION: z.string().min(1).default("dev"),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65_535).default(5433),
  DB_NAME: z.string().min(1).default("wl_35"),
  DB_USER: z.string().min(1).default("postgres"),
  DB_PASSWORD: z.string().min(1).default("postgres"),
  SHUTDOWN_DELAY_MS: z.coerce.number().int().min(0).default(5_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MIGRATIONS_DIR: z.string().min(1).default("migrations"),
});

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: LogLevel;
  appVersion: string;
  db: { host: string; port: number; database: string; user: string; password: string };
  shutdownDelayMs: number;
  shutdownTimeoutMs: number;
  migrationsDir: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Treat empty strings as unset so `PORT=` falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    appVersion: e.APP_VERSION,
    db: { host: e.DB_HOST, port: e.DB_PORT, database: e.DB_NAME, user: e.DB_USER, password: e.DB_PASSWORD },
    shutdownDelayMs: e.SHUTDOWN_DELAY_MS,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    migrationsDir: e.MIGRATIONS_DIR,
  };
}
