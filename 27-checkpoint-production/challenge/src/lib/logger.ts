import { pino, type DestinationStream, type Logger } from "pino";

export type { Logger };

/**
 * The app's logger. Tests call this with their own destination stream to capture lines,
 * so anything you configure here (like redaction) applies in tests too.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = { level };
  return destination ? pino(options, destination) : pino(options);
}
