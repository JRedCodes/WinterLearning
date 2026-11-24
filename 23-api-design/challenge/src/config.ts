import { z } from "zod";

/** The only file that reads process.env. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PROBLEM_BASE_URL: z.url().default("https://api.wl.example/problems/"),
});

export interface Config {
  port: number;
  problemBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return { port: parsed.data.PORT, problemBaseUrl: parsed.data.PROBLEM_BASE_URL };
}
