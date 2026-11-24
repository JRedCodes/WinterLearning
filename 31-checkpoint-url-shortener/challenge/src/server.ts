/**
 * Process entry point (provided). Owns the process-level concerns: config, connections, listen,
 * the click-drain loop and graceful shutdown. All wiring of your code happens in createContainer().
 */
import { Redis } from "ioredis";
import pg from "pg";
import { loadConfig } from "./config.js";
import { createContainer } from "./container.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });

const { app, drainClicks } = createContainer({ config, pool, redis });
const server = app.listen(config.port, () => {
  console.log(`url shortener on http://localhost:${config.port}`);
});

// Click aggregation loop: one drain at a time, errors logged and retried on the next tick.
let draining = false;
const timer = setInterval(async () => {
  if (draining) return;
  draining = true;
  try {
    await drainClicks();
  } catch (err) {
    console.error("click drain failed", err);
  } finally {
    draining = false;
  }
}, config.clickDrainIntervalMs);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  clearInterval(timer);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    try {
      await drainClicks().catch(() => 0); // flush what we can
      await pool.end();
      redis.disconnect();
    } finally {
      process.exit(0);
    }
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
