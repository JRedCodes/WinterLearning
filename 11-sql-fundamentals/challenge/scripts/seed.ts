// npm run seed: (re)create wl_11 with the Shopfront dataset so you can explore it in psql.
import { connect, ensureDatabase, loadDataset, databaseUrl } from "../src/db.js";

await ensureDatabase();
const client = await connect();
try {
  await loadDataset(client);
  const { rows } = await client.query(
    "SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM orders) AS orders",
  );
  console.log(`Loaded Shopfront dataset into ${new URL(databaseUrl()).pathname.slice(1)}:`, rows[0]);
} finally {
  await client.end();
}
