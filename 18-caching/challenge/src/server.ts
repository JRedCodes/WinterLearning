/**
 * Composition root: the one place that knows about real implementations.
 * Swap `CachedProductRepository` out of the wiring below and the app still
 * works, just slower. That's the point of the decorator.
 */
import pg from "pg";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { RedisCache } from "./cache/cache.js";
import { CacheMetrics } from "./cache/cacheMetrics.js";
import { PgProductRepository } from "./repositories/pgProductRepository.js";
import { CachedProductRepository } from "./repositories/cachedProductRepository.js";
import { ProductService } from "./services/productService.js";

const config = loadConfig();

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const redis = new Redis(config.redisUrl, {
  // Fail fast when Redis is down so requests fall back to Postgres
  // instead of hanging in ioredis's offline queue.
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
redis.on("error", (err) => console.error("redis error:", err.message));

const metrics = new CacheMetrics();
const products = new CachedProductRepository(
  new PgProductRepository(pool, { queryDelayMs: config.productQueryDelayMs }),
  new RedisCache(redis),
  metrics,
  config.cache,
);
const app = createApp({ productService: new ProductService(products), cacheMetrics: metrics });

const server = app.listen(config.port, () => {
  console.log(`product api listening on http://localhost:${config.port}`);
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
