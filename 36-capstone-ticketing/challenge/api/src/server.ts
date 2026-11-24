import { Redis } from "ioredis";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { buildContainer } from "./container.js";
import { migrate } from "./db/migrate.js";
import { createPool } from "./db/pool.js";
import { systemClock } from "./lib/clock.js";
import type { EventPublisher } from "./messaging/eventPublisher.js";
import { consoleEmailSender } from "./notifications/emailSender.js";

/**
 * Composition root for the HTTP API process:
 * config -> infrastructure -> container -> app -> listen -> graceful shutdown.
 *
 * The API never talks to Kafka. Bookings write to the outbox; the worker
 * process (worker.ts, M4) relays the outbox to Kafka.
 */
const apiProcessPublisher: EventPublisher = {
  async publish() {
    throw new Error("The API process does not publish events; run the worker (npm run worker)");
  },
};

const config = loadConfig();
const pool = createPool({ connectionString: config.databaseUrl, max: config.dbPoolMax });
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

if (config.env !== "production") await migrate(pool); // in Kubernetes a Job runs migrations

const container = buildContainer({
  config,
  pool,
  redis,
  clock: systemClock,
  publisher: apiProcessPublisher,
  emailSender: consoleEmailSender,
});
const server = createApp(container).listen(config.port, () => {
  console.log(`ticketing api listening on http://localhost:${config.port}`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, draining connections`);
    // Long-lived SSE streams would keep close() waiting forever.
    setTimeout(() => server.closeAllConnections(), 10_000).unref();
    server.close(async () => {
      await container.close();
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(0);
    });
  });
}
