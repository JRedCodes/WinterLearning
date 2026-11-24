import { z } from "zod";
import type { JobSettings } from "./jobs/types.js";

/** The only file that reads process.env. Parsed once, fails fast. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // Database index 4 = module id 20 mod 16.
  REDIS_URL: z.string().default("redis://localhost:6380/4"),
  JOB_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  JOB_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
  JOB_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(60_000),
  EMAIL_CONCURRENCY: z.coerce.number().int().positive().default(5),
  THUMBNAIL_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export interface Config {
  port: number;
  redisUrl: string;
  /** Every BullMQ key starts with this (plus ":"), e.g. wl:20:emails:wait */
  bullPrefix: string;
  /** Prefix for our own idempotency keys. */
  idempotencyPrefix: string;
  jobs: JobSettings;
  concurrency: { email: number; thumbnail: number };
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
    bullPrefix: "wl:20",
    idempotencyPrefix: "wl:20:idem:",
    jobs: {
      attempts: e.JOB_ATTEMPTS,
      backoff: { baseMs: e.JOB_BACKOFF_BASE_MS, maxMs: e.JOB_BACKOFF_MAX_MS },
    },
    concurrency: { email: e.EMAIL_CONCURRENCY, thumbnail: e.THUMBNAIL_CONCURRENCY },
  };
}
