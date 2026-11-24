import type { LogLevel } from "./lib/logger.js";

export type NodeEnv = "development" | "test" | "production";

export interface Config {
  env: NodeEnv;
  port: number;
  logLevel: LogLevel;
  pagination: { defaultLimit: number; maxLimit: number };
  /** Required in production. Never logged, never committed. */
  apiKey: string | undefined;
}

type Env = Record<string, string | undefined>;

/** Thrown when the environment is invalid. Lists EVERY problem, not just the first. */
export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * TODO(1): Typed, fail-fast configuration with zod.
 *
 * Define a zod schema for these variables and parse `env` with it ONCE:
 *
 *   NODE_ENV           "development" | "test" | "production", default "development"
 *   PORT               integer 1–65535, default 3000            (env values are strings: coerce!)
 *   LOG_LEVEL          "debug" | "info" | "warn" | "error" | "silent"
 *                      default depends on NODE_ENV: development → "debug",
 *                      test → "silent", production → "info"
 *   DEFAULT_PAGE_SIZE  integer 1–1000, default 20
 *   MAX_PAGE_SIZE      integer 1–1000, default 100
 *   API_KEY            optional string, at least 16 characters
 *
 * Cross-field rules:
 *   - API_KEY is REQUIRED when NODE_ENV is "production"
 *   - DEFAULT_PAGE_SIZE must be ≤ MAX_PAGE_SIZE
 *
 * Treat empty strings ("PORT=") as "not set" so defaults apply.
 *
 * On failure, throw ConfigError with one issue string per problem, formatted
 * "<VARIABLE>: <message>", e.g. "PORT: Invalid input: expected number, received NaN".
 *
 * Read ONLY from the `env` argument. (Its default is the one place process.env
 * appears in the whole app.)
 *
 * The placeholder below ignores env entirely.
 */
export function loadConfig(_env: Env = process.env): Config {
  return {
    env: "development",
    port: 3000,
    logLevel: "debug",
    pagination: { defaultLimit: 20, maxLimit: 100 },
    apiKey: undefined,
  };
}
