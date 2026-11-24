/**
 * A deliberately tiny JSON-lines logger so this module has no logging dependency.
 * Module 24 uses pino. The interface is compatible enough that you could swap pino in.
 *
 * Containers should log to stdout/stderr, one JSON object per line: the platform
 * (Docker, Kubernetes, your log shipper) collects it. Never log to files inside a container.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

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
    const serializable = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v]),
    );
    write(JSON.stringify({ level: lvl, time: new Date().toISOString(), msg, ...serializable }));
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

/** For tests: swallow everything. */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
