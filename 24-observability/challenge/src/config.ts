import { z } from "zod";

const LogLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  LOG_LEVEL: LogLevel.default("info"),
  SERVICE_NAME: z.string().min(1).default("checkout"),
  PAYMENTS_URL: z.url().default("http://localhost:4001"),
  READINESS_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),
});

export interface Config {
  port: number;
  logLevel: z.infer<typeof LogLevel>;
  serviceName: string;
  paymentsUrl: string;
  readinessTimeoutMs: number;
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
    logLevel: e.LOG_LEVEL,
    serviceName: e.SERVICE_NAME,
    paymentsUrl: e.PAYMENTS_URL,
    readinessTimeoutMs: e.READINESS_TIMEOUT_MS,
  };
}
