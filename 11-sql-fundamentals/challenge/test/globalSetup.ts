import { connect, ensureDatabase, loadDataset } from "../src/db.js";

/** Runs once before all tests: fresh wl_11 database with the Shopfront dataset. */
export default async function setup(): Promise<void> {
  await ensureDatabase();
  const client = await connect();
  try {
    await loadDataset(client);
  } finally {
    await client.end();
  }
}
