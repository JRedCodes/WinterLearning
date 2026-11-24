import type { Result } from "./result.js";

/**
 * TODO(5b): parseConfig(): narrowing `unknown` safely
 *
 * Port legacy/parseConfig.js, but properly: the input comes from JSON.parse,
 * so its type is `unknown` and you have to PROVE every field's type before
 * using it. No `any`, no `as AppConfig`.
 *
 * 1. LOG_LEVELS: add `as const` so its type is the readonly tuple
 *    `readonly ["debug", "info", "warn", "error"]`, then DERIVE LogLevel from
 *    it with an indexed access type: `(typeof LOG_LEVELS)[number]`.
 * 2. AppConfig: every field readonly (see the type tests for the exact shape).
 * 3. isLogLevel(value: unknown): a type predicate (`value is LogLevel`).
 * 4. parseConfig(input: unknown): Result<AppConfig, ConfigError[]>
 *      - input must be a plain object (not null, not an array) or you return a
 *        single error with path "" (the whole input).
 *      - port: required; an integer from 1 to 65535 (a string "8080" is wrong).
 *      - host: optional string, default "localhost"; blank strings are wrong.
 *      - logLevel: optional, default "info"; must be one of LOG_LEVELS.
 *      - features: optional array of strings, default []. Report each bad
 *        element with its index: path "features[2]".
 *      - Collect ALL errors (in the field order above) before returning.
 *      - Don't copy unknown fields into the result.
 *
 * Spec: test/parseConfig.test.ts and test/types/parseConfig.test-d.ts.
 */

// TODO(5b): make this `as const` and derive LogLevel from it.
export const LOG_LEVELS = ["debug", "info", "warn", "error"];
export type LogLevel = string;

export interface AppConfig {
  port: unknown;
  host: unknown;
  logLevel: unknown;
  features: unknown;
}

export interface ConfigError {
  /** Which field is wrong: "port", "features[2]", or "" for the whole input. */
  readonly path: string;
  readonly message: string;
}

export function isLogLevel(value: unknown): boolean {
  throw new Error("Not implemented: isLogLevel (TODO 5)");
}

export function parseConfig(input: unknown): Result<AppConfig, ConfigError[]> {
  throw new Error("Not implemented: parseConfig (TODO 5)");
}
