import { loadConfig } from "./config.js";
import { connectRedis } from "./lib/redis.js";
import { FixedWindowLimiter } from "./limiter/fixedWindow.js";
import { TokenBucketLimiter } from "./limiter/tokenBucket.js";
import { createApp } from "./app.js";

/**
 * Composition root: the only place that knows about env vars, real Redis and
 * which algorithm protects which route.
 */
const config = loadConfig();
const redis = await connectRedis(config.redisUrl);

const app = createApp({
  apiLimiter: new FixedWindowLimiter({
    redis,
    prefix: `${config.keyPrefix}api:`,
    limit: config.apiLimitPerMinute,
    windowMs: 60_000,
  }),
  loginLimiter: new TokenBucketLimiter({
    redis,
    prefix: `${config.keyPrefix}login:`,
    capacity: config.loginBurst,
    refillPerSecond: config.loginRefillPerMinute / 60,
  }),
  trustProxyHops: config.trustProxyHops,
});

const server = app.listen(config.port, () => {
  console.log(`rate-limited api listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      redis.disconnect();
      process.exit(0);
    });
  });
}
