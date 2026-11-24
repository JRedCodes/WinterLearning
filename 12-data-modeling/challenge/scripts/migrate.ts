// npm run migrate: apply pending migrations from ./migrations to wl_12.
import { fileURLToPath } from "node:url";
import { connect, ensureDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";

const dir = fileURLToPath(new URL("../migrations/", import.meta.url));

await ensureDatabase();
const client = await connect();
try {
  const applied = await migrate(client, dir);
  console.log(applied.length ? `Applied:\n  ${applied.join("\n  ")}` : "Nothing to migrate.");
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
