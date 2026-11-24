export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** One JSON line per call. Module 24 swaps this for pino. */
export function createConsoleLogger(name: string): Logger {
  const write = (level: string, message: string, context?: Record<string, unknown>) =>
    console.log(JSON.stringify({ time: new Date().toISOString(), level, name, message, ...context }));
  return {
    info: (m, c) => write("info", m, c),
    warn: (m, c) => write("warn", m, c),
    error: (m, c) => write("error", m, c),
  };
}

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
