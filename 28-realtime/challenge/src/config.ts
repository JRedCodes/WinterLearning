import { z } from "zod";

/**
 * The only file that reads process.env. Parsed once at startup; a bad value
 * fails fast with a readable message instead of surfacing later as NaN.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).default(3000),
  // Database index 12 = module id 28 mod 16.
  REDIS_URL: z.string().default("redis://localhost:6380/12"),
  // Every Redis key AND pub/sub channel this module uses starts with this.
  // Pub/sub ignores the database index, so the prefix is what isolates us.
  KEY_PREFIX: z.string().default("wl:28:"),
  TOKEN_SECRET: z.string().min(8).default("dev-secret-change-me"),
  HEARTBEAT_MS: z.coerce.number().int().positive().default(30_000),
  SSE_KEEPALIVE_MS: z.coerce.number().int().positive().default(15_000),
  MAX_BUFFERED_BYTES: z.coerce.number().int().positive().default(1_048_576),
  HISTORY_SIZE: z.coerce.number().int().positive().default(50),
});

export interface Config {
  port: number;
  redisUrl: string;
  keyPrefix: string;
  tokenSecret: string;
  heartbeatMs: number;
  sseKeepAliveMs: number;
  maxBufferedBytes: number;
  historySize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    redisUrl: e.REDIS_URL,
    keyPrefix: e.KEY_PREFIX,
    tokenSecret: e.TOKEN_SECRET,
    heartbeatMs: e.HEARTBEAT_MS,
    sseKeepAliveMs: e.SSE_KEEPALIVE_MS,
    maxBufferedBytes: e.MAX_BUFFERED_BYTES,
    historySize: e.HISTORY_SIZE,
  };
}
