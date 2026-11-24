import { z } from "zod";

/**
 * The ONLY file that reads process.env. Everything else receives a typed
 * Config object from the composition root (server.ts).
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5433/wl_13"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_APP_NAME: z.string().min(1).default("wl-13-tasks-api"),
  MIGRATIONS_DIR: z.string().min(1).default("migrations"),
});

export interface Config {
  port: number;
  databaseUrl: string;
  poolMax: number;
  appName: string;
  migrationsDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    poolMax: e.DB_POOL_MAX,
    appName: e.DB_APP_NAME,
    migrationsDir: e.MIGRATIONS_DIR,
  };
}
