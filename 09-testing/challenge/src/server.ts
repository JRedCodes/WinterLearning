import { randomUUID } from "node:crypto";
import pg from "pg";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ensureDatabase } from "./db/ensureDatabase.js";
import { migrate } from "./db/migrate.js";
import { systemClock } from "./lib/clock.js";
import { PgWalletRepository } from "./repositories/pgWalletRepository.js";
import { WalletService } from "./services/walletService.js";

// Composition root.
const config = loadConfig();
await ensureDatabase(config.databaseUrl);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool);

const walletService = new WalletService({
  repo: new PgWalletRepository(pool),
  clock: systemClock,
  newId: () => randomUUID(),
});

const server = createApp({ walletService }).listen(config.port, () => {
  console.log(`wallet api listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
