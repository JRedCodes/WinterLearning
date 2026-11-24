import { z } from "zod";

/**
 * The only file that reads process.env. Parsed once at startup; a bad value
 * fails fast with a readable message instead of surfacing later as NaN.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // Database index 3 = module id 19 mod 16.
  REDIS_URL: z.string().default("redis://localhost:6380/3"),
  API_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  LOGIN_BURST: z.coerce.number().int().positive().default(5),
  LOGIN_REFILL_PER_MINUTE: z.coerce.number().positive().default(5),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

export interface Config {
  port: number;
  redisUrl: string;
  keyPrefix: string;
  apiLimitPerMinute: number;
  loginBurst: number;
  loginRefillPerMinute: number;
  trustProxyHops: number;
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
    keyPrefix: "wl:19:rl:",
    apiLimitPerMinute: e.API_LIMIT_PER_MINUTE,
    loginBurst: e.LOGIN_BURST,
    loginRefillPerMinute: e.LOGIN_REFILL_PER_MINUTE,
    trustProxyHops: e.TRUST_PROXY_HOPS,
  };
}
