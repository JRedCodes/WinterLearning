import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { buildServices } from "./container.js";
import { migrate } from "./db/migrate.js";
import { createPool, type Queryable } from "./db/pool.js";
import { QueryRecorder } from "./db/queryRecorder.js";

// Composition root. Run `npm run seed` once before `npm run dev`.
const config = loadConfig();
const pool = createPool(config);
await migrate(pool, config.migrationsDir);

const db: Queryable = config.logQueries
  ? new QueryRecorder(pool, (q) => {
      const sql = q.text.replace(/\s+/g, " ").trim();
      console.log(`[sql ${q.durationMs.toFixed(1)}ms rows=${q.rowCount}] ${sql.slice(0, 160)}`);
    })
  : pool;

const app = createApp(buildServices(db));
const server = app.listen(config.port, () => {
  console.log(`feed api listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  });
}
