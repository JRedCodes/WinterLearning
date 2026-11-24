import { expectTypeOf } from "vitest";
import { err, ok, type Result } from "../../src/result.js";
import {
  isLogLevel,
  LOG_LEVELS,
  parseConfig,
  type AppConfig,
  type ConfigError,
  type LogLevel,
} from "../../src/parseConfig.js";

// LogLevel is derived from the LOG_LEVELS array (as const), not written twice.
expectTypeOf<LogLevel>().toEqualTypeOf<"debug" | "info" | "warn" | "error">();
expectTypeOf(LOG_LEVELS).toEqualTypeOf<readonly ["debug", "info", "warn", "error"]>();

// Result is a discriminated union on `ok`.
declare const r: Result<number, string>;
if (r.ok) {
  expectTypeOf(r.value).toEqualTypeOf<number>();
} else {
  expectTypeOf(r.error).toEqualTypeOf<string>();
}
// @ts-expect-error you must check `ok` before reading `value`
r.value;

// ok/err build results that fit any Result with a compatible side.
const good: Result<number, string> = ok(1);
const bad: Result<number, string> = err("nope");
expectTypeOf(good).toEqualTypeOf<Result<number, string>>();
expectTypeOf(bad).toEqualTypeOf<Result<number, string>>();

// isLogLevel is a type predicate.
expectTypeOf(isLogLevel).guards.toEqualTypeOf<LogLevel>();
expectTypeOf(isLogLevel).parameter(0).toBeUnknown();

// parseConfig accepts anything (untrusted input) and returns a typed Result.
expectTypeOf(parseConfig).parameter(0).toBeUnknown();
expectTypeOf(parseConfig).returns.toEqualTypeOf<Result<AppConfig, ConfigError[]>>();

expectTypeOf<AppConfig>().toEqualTypeOf<{
  readonly port: number;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly features: readonly string[];
}>();
expectTypeOf<ConfigError>().toHaveProperty("path").toEqualTypeOf<string>();
expectTypeOf<ConfigError>().toHaveProperty("message").toEqualTypeOf<string>();

const parsed = parseConfig({ port: 1 });
if (parsed.ok) {
  // @ts-expect-error the config is readonly
  parsed.value.port = 2;
}
