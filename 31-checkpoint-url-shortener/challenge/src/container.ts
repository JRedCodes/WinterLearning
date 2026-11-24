import type { Express } from "express";
import type { Redis } from "ioredis";
import type pg from "pg";
import type { AppConfig } from "./config.js";

/**
 * THE CONTRACT WITH THE TESTS. Keep these exported names and shapes; everything behind them is yours.
 *
 * `createContainer` is your testable composition root: it receives the infrastructure (already
 * connected pool and Redis client, a clock) and wires your repositories, services, controllers and
 * the Express app together. `server.ts` calls it with real dependencies; the tests call it with an
 * instrumented pool and a fake clock.
 */

/** Returns "now". Use it everywhere instead of `new Date()` / `Date.now()` so tests can move time. */
export type Clock = () => Date;

export interface ContainerDeps {
  config: AppConfig;
  /** Use this pool for every Postgres query (the tests count calls on it). Don't end it: the caller owns it. */
  pool: pg.Pool;
  /** Use this client for every Redis command. Don't disconnect it: the caller owns it. */
  redis: Redis;
  /** Defaults to the real clock. */
  clock?: Clock;
}

export interface Container {
  /** The Express app: no listen() inside. */
  app: Express;
  /**
   * Processes ALL click events recorded so far (until none are pending), aggregating them into
   * Postgres. Resolves with the number of click events consumed (0 when there was nothing to do).
   * server.ts calls this on an interval; the tests call it directly.
   */
  drainClicks(): Promise<number>;
}

export function createContainer(deps: ContainerDeps): Container {
  void deps;
  throw new Error("Not implemented: wire your app in src/container.ts (see CHALLENGE.md)");
}
