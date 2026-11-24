import { loadConfig } from "./config.js";
import { startInstance } from "./instance.js";

/**
 * Composition root. Run two of these on different ports against the same
 * Redis and they behave as one chat:
 *   PORT=3000 npm run dev
 *   PORT=3001 npm run dev
 */
const config = loadConfig();
const instance = await startInstance({
  port: config.port,
  redisUrl: config.redisUrl,
  keyPrefix: config.keyPrefix,
  tokenSecret: config.tokenSecret,
  heartbeatMs: config.heartbeatMs,
  sseKeepAliveMs: config.sseKeepAliveMs,
  maxBufferedBytes: config.maxBufferedBytes,
  historySize: config.historySize,
});
console.log(`chat listening on ${instance.httpUrl} (WebSocket: ${instance.wsUrl}?token=...)`);
console.log(`get a token with: npm run token -- alice`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, closing sockets and shutting down`);
    instance.close().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error(err);
        process.exit(1);
      },
    );
  });
}
