import type { System, SystemOptions } from "./contract.js";

/**
 * Build the whole service here: run migrations, connect Postgres and Redis,
 * create queues, start the worker, build the Express app.
 *
 * This file is your composition root for tests; src/server.ts should call it
 * with real config and a real fetcher. Read CHALLENGE.md for the full spec.
 */
export async function createSystem(options: SystemOptions): Promise<System> {
  void options;
  throw new Error("Not implemented: createSystem (see CHALLENGE.md)");
}
