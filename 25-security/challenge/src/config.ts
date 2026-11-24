import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5433/wl_25"),
  STORAGE_DIR: z.string().default("./storage"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export interface Config {
  port: number;
  databaseUrl: string;
  storageDir: string;
  corsOrigins: string[];
}

/** The only place in the app that reads process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    storageDir: e.STORAGE_DIR,
    corsOrigins: e.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  };
}
