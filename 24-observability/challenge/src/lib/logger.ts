import { pino, type DestinationStream, type Logger } from "pino";

export type { Logger };

export interface LoggerOptions {
  level?: string;
  service?: string;
}

/**
 * Builds the root logger. Everything else gets a *child* of this logger.
 *
 * `destination` is injectable so tests can capture log lines in memory.
 * In production it defaults to stdout: the platform (Docker, Kubernetes,
 * a log shipper) collects stdout, the app never writes log files itself.
 */
export function createLogger(options: LoggerOptions = {}, destination?: DestinationStream): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: { service: options.service ?? "checkout" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        // "level":"info" instead of "level":30. Easier to grep, easier to read.
        level: (label) => ({ level: label }),
      },
    },
    destination ?? pino.destination(1),
  );
}
