import { z } from "zod";
import type { ServiceName } from "./domain/product.js";
import type { FaultProfile } from "./downstream/simulated.js";

/**
 * The only file that reads process.env. Parsed once at startup.
 */
const rate = z.coerce.number().min(0).max(1);
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).default(3000),
  // Real downstream base URLs. When unset, simulated flaky downstreams are used.
  CATALOG_URL: z.url().optional(),
  PRICING_URL: z.url().optional(),
  REVIEWS_URL: z.url().optional(),
  // Fault injection for the simulated downstreams (npm run dev).
  CATALOG_LATENCY_MS: z.coerce.number().min(0).default(40),
  CATALOG_FAILURE_RATE: rate.default(0.02),
  CATALOG_SLOW_RATE: rate.default(0.01),
  PRICING_LATENCY_MS: z.coerce.number().min(0).default(60),
  PRICING_FAILURE_RATE: rate.default(0.1),
  PRICING_SLOW_RATE: rate.default(0.05),
  REVIEWS_LATENCY_MS: z.coerce.number().min(0).default(80),
  REVIEWS_FAILURE_RATE: rate.default(0.3),
  REVIEWS_SLOW_RATE: rate.default(0.1),
});

export interface Config {
  port: number;
  urls: Partial<Record<ServiceName, string>>;
  faults: Record<ServiceName, FaultProfile>;
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
    urls: { catalog: e.CATALOG_URL, pricing: e.PRICING_URL, reviews: e.REVIEWS_URL },
    faults: {
      catalog: { latencyMs: e.CATALOG_LATENCY_MS, failureRate: e.CATALOG_FAILURE_RATE, slowRate: e.CATALOG_SLOW_RATE },
      pricing: { latencyMs: e.PRICING_LATENCY_MS, failureRate: e.PRICING_FAILURE_RATE, slowRate: e.PRICING_SLOW_RATE },
      reviews: { latencyMs: e.REVIEWS_LATENCY_MS, failureRate: e.REVIEWS_FAILURE_RATE, slowRate: e.REVIEWS_SLOW_RATE },
    },
  };
}
