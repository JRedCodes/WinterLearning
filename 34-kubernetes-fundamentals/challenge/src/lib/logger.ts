/**
 * Tiny JSON-lines logger (module 24 uses pino). In Kubernetes you log to stdout, one JSON
 * object per line; the kubelet captures it and `kubectl logs` shows it.
 */
import type { LogLevel } from "../config.js";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(
  level: LogLevel = "info",
  write: (line: string) => void = (line) => process.stdout.write(line + "\n"),
): Logger {
  const log = (lvl: LogLevel) => (msg: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const safe = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? { name: v.name, message: v.message } : v]),
    );
    write(JSON.stringify({ level: lvl, time: new Date().toISOString(), msg, ...safe }));
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
