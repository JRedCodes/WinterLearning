import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

/** Composition root. */
const config = loadConfig();
const app = createApp({ problemBaseUrl: config.problemBaseUrl });

const server = app.listen(config.port, () => {
  console.log(`tasks api listening on http://localhost:${config.port}/v1`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
