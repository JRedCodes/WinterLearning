// npm run db:reset: drop everything in wl_12 and apply all migrations from scratch.
// Fine on your laptop. Never do this to a database that holds real data.
import { fileURLToPath } from "node:url";
import { connect, dropPublicSchema, ensureDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const dir = fileURLToPath(new URL("../migrations/", import.meta.url));

await ensureDatabase();
const client = await connect();
try {
  await dropPublicSchema(client);
  const applied = await migrate(client, dir);
  console.log(`Schema rebuilt. Applied:\n  ${applied.join("\n  ") || "(no migrations)"}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
