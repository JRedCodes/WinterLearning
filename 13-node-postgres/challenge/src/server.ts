import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { InMemoryTaskRepository } from "./repositories/inMemoryTaskRepository.js";
import { TaskService } from "./services/taskService.js";

export interface RunningServer {
  /** e.g. http://localhost:54321 */
  url: string;
  /** Stops accepting connections, waits for in-flight requests, releases resources. */
  close(): Promise<void>;
}

/**
 * Composition root: the one place that creates real infrastructure and wires
 * it together.
 *
 * TODO(6): switch the app to Postgres.
 *  - Create ONE pool with createPool(config).
 *  - Run migrate(pool, { dir: config.migrationsDir }) before listening
 *    (fine for this app; module 26 discusses running it as a deploy step).
 *  - Back the TaskService with a PgTaskRepository instead of InMemory.
 *  - close(): stop the HTTP server first, THEN `await pool.end()`, so
 *    in-flight requests can still use the database while draining.
 *  - If anything fails during startup, end the pool before rethrowing so a
 *    failed boot doesn't leave connections behind.
 */
export async function startServer(config: Config): Promise<RunningServer> {
  const repository = new InMemoryTaskRepository();
  const app = createApp({ taskService: new TaskService(repository) });

  const server = app.listen(config.port);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const running = await startServer(config);
  console.log(`tasks api listening on ${running.url}`);

  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received, shutting down`);
      // Don't wait forever on a stuck connection.
      setTimeout(() => process.exit(1), 10_000).unref();
      running.close().then(
        () => process.exit(0),
        (err: unknown) => {
          console.error(err);
          process.exit(1);
        },
      );
    });
  }
}

// Run main() only when executed directly (tsx src/server.ts), not when a test imports this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
