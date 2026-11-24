import { z } from "zod";

/**
 * The ONLY file that reads process.env (the lint script enforces this).
 * Parse once at startup, fail fast with a readable message, hand a typed object to everyone else.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_26"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MIGRATIONS_DIR: z.string().min(1).default("migrations"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  shutdownTimeoutMs: number;
  migrationsDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Treat empty strings as "unset" so `PORT=` in a .env file falls back to the default.
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
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    migrationsDir: e.MIGRATIONS_DIR,
    logLevel: e.LOG_LEVEL,
  };
}
