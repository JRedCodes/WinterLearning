import { ensureDatabase } from "../src/db/ensureDatabase.js";

/** Runs once before all test files: makes sure the wl_09 database exists. */
export default async function setup() {
  await ensureDatabase(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_09");
}
