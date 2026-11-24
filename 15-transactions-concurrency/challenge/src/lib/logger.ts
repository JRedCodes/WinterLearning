/** The tiny logging surface the app needs. Swap in pino in module 24. */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (msg, meta) => console.log(msg, meta ?? ""),
  error: (msg, meta) => console.error(msg, meta ?? ""),
};
