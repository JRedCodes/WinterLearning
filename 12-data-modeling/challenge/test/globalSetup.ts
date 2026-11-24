import { ensureDatabase } from "../src/db.js";

/** Runs once before all tests. Each test file then rebuilds the schema itself (see helpers/db.ts). */
export default async function setup(): Promise<void> {
  await ensureDatabase();
}
