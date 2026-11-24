import type { RequestListener } from "node:http";
import type { Logger } from "./logger.js";

/**
 * Graceful shutdown for an HTTP server: the part of "deployment" that lives in your code.
 *
 * Read the lesson section "Graceful shutdown" and docs/graceful-shutdown.md first.
 * The contract below is what test/lifecycle.test.ts and test/signals.test.ts check.
 */

export interface ShutdownHook {
  /** Shows up in logs and in ShutdownReport.hookErrors, e.g. "postgres". */
  name: string;
  close: () => Promise<void> | void;
}

export interface LifecycleOptions {
  /** The request listener, usually your Express app. */
  handler: RequestListener;
  /** 0 = pick a free port (tests do this). */
  port: number;
  /** Defaults to "0.0.0.0" so the server is reachable from outside a container. */
  host?: string;
  /** Max time to wait for in-flight requests before forcibly closing connections. */
  drainTimeoutMs: number;
  /** Run in order, AFTER the HTTP server has stopped (close the DB pool here). */
  onShutdown?: ShutdownHook[];
  logger?: Logger;
}

export interface ShutdownReport {
  /** true if the drain timeout fired and connections had to be destroyed. */
  forced: boolean;
  durationMs: number;
  /** Hooks that threw/rejected. A failing hook must not stop the others from running. */
  hookErrors: { name: string; error: unknown }[];
}

export type LifecycleState = "idle" | "running" | "draining" | "stopped";

export interface ServerLifecycle {
  /** Starts listening. Resolves with the actual port (useful with port 0). */
  start(): Promise<number>;
  /**
   * Idempotent: calling it twice returns the SAME promise. Steps:
   *  1. state -> "draining" (synchronously), stop accepting new connections
   *  2. close idle keep-alive connections right away; ask clients of busy ones to go away
   *     (`Connection: close`) and close them as soon as their response is done
   *  3. wait for in-flight requests, at most drainTimeoutMs, then destroy what's left
   *  4. run onShutdown hooks in order, collecting errors
   *  5. state -> "stopped", resolve with a report
   */
  shutdown(reason?: string): Promise<ShutdownReport>;
  readonly state: LifecycleState;
  /** true once shutdown has started (draining or stopped). Feed this to /readyz. */
  isShuttingDown(): boolean;
}

/** The bits of `process` that installSignalHandlers needs (tests pass a fake). */
export interface SignalTarget {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  exit(code: number): void;
}

// TODO(5): implement createServerLifecycle. See the contract above and CHALLENGE.md.
export function createServerLifecycle(_options: LifecycleOptions): ServerLifecycle {
  throw new Error("Not implemented: createServerLifecycle (TODO 5)");
}

// TODO(6): implement installSignalHandlers.
//  - On the first SIGTERM or SIGINT: call lifecycle.shutdown(signal), then exit(0),
//    or exit(1) if the report says it was forced or a hook failed (or shutdown rejected).
//  - On a second signal while already shutting down: exit(1) immediately (the impatient Ctrl+C).
export function installSignalHandlers(
  _lifecycle: Pick<ServerLifecycle, "shutdown">,
  _target: SignalTarget,
  _logger?: Logger,
): void {
  throw new Error("Not implemented: installSignalHandlers (TODO 6)");
}
