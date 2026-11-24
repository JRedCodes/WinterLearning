import { Redis } from "ioredis";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { buildContainer } from "./container.js";
import { migrate } from "./db/migrations.js";
import { createPool } from "./db/pool.js";

/** Composition root: config -> infrastructure -> container -> app -> listen. */
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const redis = new Redis(config.redisUrl);

await migrate(pool);
const app = createApp(buildContainer({ pool, redis, config }));

const server = app.listen(config.port, () => {
  console.log(`auth api listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(0);
    });
  });
}
