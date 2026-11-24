import { z } from "zod";

/**
 * The only file that reads process.env. Everything else receives a typed Config.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_22"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380/6"),
  REDIS_KEY_PREFIX: z.string().min(1).default("wl:22:"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  redisUrl: string;
  redisKeyPrefix: string;
  sessionTtlSeconds: number;
  cookieSecure: boolean;
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
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    sessionTtlSeconds: e.SESSION_TTL_SECONDS,
    // Secure by default in production; opt-in elsewhere so curl over http://localhost works.
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : e.NODE_ENV === "production",
  };
}
