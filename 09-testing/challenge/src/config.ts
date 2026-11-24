import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/wl_09"),
});

export interface Config {
  port: number;
  databaseUrl: string;
}

/** The only place that reads process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return { port: parsed.data.PORT, databaseUrl: parsed.data.DATABASE_URL };
}
