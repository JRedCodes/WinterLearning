import { z } from "zod";

/**
 * The only module that reads import.meta.env (the frontend version of
 * "config.ts is the only reader of process.env").
 *
 * Vite replaces import.meta.env.VITE_* at BUILD time. Everything here ends up
 * in the JavaScript bundle that any visitor can read: no secrets, ever.
 */
const EnvSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  VITE_PROJECT_ID: z.string().min(1).default("demo"),
});

export interface AppConfig {
  apiUrl: string;
  projectId: string;
}

export function loadConfig(env: Record<string, unknown> = import.meta.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid frontend config:\n${z.prettifyError(parsed.error)}`);
  }
  return { apiUrl: parsed.data.VITE_API_URL, projectId: parsed.data.VITE_PROJECT_ID };
}
