import type { Express } from "express";
import type pg from "pg";

export interface BuildAppOptions {
  pool: pg.Pool;
}

/**
 * The tests' single entry point into your app.
 *
 * Wire your repositories -> services -> createApp(...) here and return the
 * Express app (without calling listen()). src/server.ts should call this too.
 *
 * Contract details: CHALLENGE.md.
 */
export function buildApp(_opts: BuildAppOptions): Express {
  throw new Error("Not implemented: wire up your app in src/compose.ts (see CHALLENGE.md)");
}
