/**
 * A deliberately tiny logger interface. The app depends on this interface,
 * not on console, so tests can capture log calls and module 24 can swap in
 * pino without touching any caller.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/** Writes one JSON line per log call, dropping anything below `level`. */
export function createConsoleLogger(level: LogLevel): Logger {
  const log = (lvl: Exclude<LogLevel, "silent">) => (message: string, meta: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = JSON.stringify({ level: lvl, time: new Date().toISOString(), message, ...serialize(meta) });
    (lvl === "error" || lvl === "warn" ? console.error : console.log)(line);
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

function serialize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
}
