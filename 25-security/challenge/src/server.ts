import { lookup } from "node:dns/promises";
import pg from "pg";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";

// Composition root.
const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool);

const app = createApp({
  pool,
  storageDir: config.storageDir,
  corsOrigins: config.corsOrigins,
  fetch: (url, init) => fetch(url, init),
  resolveHost: async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address),
});

const server = app.listen(config.port, () => {
  console.log(`file sharing api on http://localhost:${config.port} (run \`make seed\` for demo tokens)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
  });
}
