import { z } from "zod";

/**
 * The only place that reads process.env. Everything else receives a typed Config.
 */
const envSchema = z.object({
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("wl-32-orders"),
  ORDERS_TOPIC: z.string().min(1).default("orders.v1"),
  ORDERS_PARTITIONS: z.coerce.number().int().min(1).max(100).default(3),
  PROJECTION_GROUP_ID: z.string().min(1).default("customer-totals"),
});

export interface Config {
  brokers: string[];
  clientId: string;
  ordersTopic: string;
  ordersPartitions: number;
  projectionGroupId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    brokers: parsed.KAFKA_BROKERS.split(",").map((b) => b.trim()).filter(Boolean),
    clientId: parsed.KAFKA_CLIENT_ID,
    ordersTopic: parsed.ORDERS_TOPIC,
    ordersPartitions: parsed.ORDERS_PARTITIONS,
    projectionGroupId: parsed.PROJECTION_GROUP_ID,
  };
}
