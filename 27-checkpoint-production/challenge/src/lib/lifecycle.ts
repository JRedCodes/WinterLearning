import type { RequestListener } from "node:http";
import type { Logger } from "./logger.js";

/**
 * Graceful shutdown: the same contract you built in module 26 (src/lib/lifecycle.ts there).
 * Port it over (and adapt the logging calls to pino), or write it again from memory.
 */
export interface ShutdownHook {
  name: string;
  close: () => Promise<void> | void;
}

export interface LifecycleOptions {
  handler: RequestListener;
  port: number;
  host?: string;
  drainTimeoutMs: number;
  onShutdown?: ShutdownHook[];
  logger?: Logger;
}

export interface ShutdownReport {
  forced: boolean;
  durationMs: number;
  hookErrors: { name: string; error: unknown }[];
}

export type LifecycleState = "idle" | "running" | "draining" | "stopped";

export interface ServerLifecycle {
  start(): Promise<number>;
  shutdown(reason?: string): Promise<ShutdownReport>;
  readonly state: LifecycleState;
  isShuttingDown(): boolean;
}

export interface SignalTarget {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  exit(code: number): void;
}

export function createServerLifecycle(_options: LifecycleOptions): ServerLifecycle {
  throw new Error("Not implemented: createServerLifecycle");
}

export function installSignalHandlers(
  _lifecycle: Pick<ServerLifecycle, "shutdown">,
  _target: SignalTarget,
  _logger?: Logger,
): void {
  throw new Error("Not implemented: installSignalHandlers");
}
