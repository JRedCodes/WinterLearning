import { z } from "zod";

/**
 * The only file that reads process.env. Parsed once at startup; invalid
 * configuration fails fast with every problem listed.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_18"),
  // Database index 2 = module id 18 mod 16.
  REDIS_URL: z.string().min(1).default("redis://localhost:6380/2"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CACHE_JITTER_RATIO: z.coerce.number().min(0).max(0.9).default(0.1),
  CACHE_NEGATIVE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  PRODUCT_QUERY_DELAY_MS: z.coerce.number().int().min(0).default(200),
});

export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  cache: { ttlSeconds: number; jitterRatio: number; negativeTtlSeconds: number };
  productQueryDelayMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    cache: {
      ttlSeconds: e.CACHE_TTL_SECONDS,
      jitterRatio: e.CACHE_JITTER_RATIO,
      negativeTtlSeconds: e.CACHE_NEGATIVE_TTL_SECONDS,
    },
    productQueryDelayMs: e.PRODUCT_QUERY_DELAY_MS,
  };
}
