import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5433/wl_33"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("wl-33-shop"),
  ORDERS_TOPIC: z.string().min(1).default("orders.v1"),
  PAYMENTS_DLQ_TOPIC: z.string().min(1).default("orders.v1.payments-dlq"),
  PAYMENTS_GROUP_ID: z.string().min(1).default("payments"),
  RELAY_INTERVAL_MS: z.coerce.number().int().min(10).default(500),
  RELAY_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
});

export type Config = z.infer<typeof EnvSchema> & { kafkaBrokers: string[] };

/** The only place in the app that reads process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return { ...parsed.data, kafkaBrokers: parsed.data.KAFKA_BROKERS.split(",").map((b) => b.trim()).filter(Boolean) };
}
