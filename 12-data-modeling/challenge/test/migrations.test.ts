import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect } from "../src/db.js";
import { MIGRATION_FILE, migrate } from "../src/migrate.js";
import { freshDatabase, migrationsDir } from "./helpers/db.js";

describe("migration files (TODO 1–3)", () => {
  it("are named NNN_lower_snake_case.sql and there are at least 2 of them", async () => {
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql"));
    for (const f of files) expect(f, `bad migration file name: ${f}`).toMatch(MIGRATION_FILE);
    expect(files.length, "split the schema into several migrations").toBeGreaterThanOrEqual(2);
  });

  it("apply cleanly to an empty database, and re-running applies nothing", async () => {
    const client = await freshDatabase();
    try {
      const again = await migrate(client, migrationsDir);
      expect(again, "a second run must find nothing pending").toEqual([]);
      const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY version");
      const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
      expect(rows.map((r) => r.name)).toEqual(files);
    } finally {
      await client.end();
    }
  });

  it("create all six tables", async () => {
    const client = await freshDatabase();
    try {
      const { rows } = await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      expect(rows.map((r) => r.tablename)).toEqual(
        expect.arrayContaining([
          "booking_attendees",
          "bookings",
          "memberships",
          "organizations",
          "rooms",
          "users",
        ]),
      );
    } finally {
      await client.end();
    }
  });
});

describe("ERD (TODO 4)", () => {
  it("docs/ERD.md contains a Mermaid erDiagram mentioning every table", async () => {
    const erd = await readFile(fileURLToPath(new URL("../docs/ERD.md", import.meta.url)), "utf8");
    const withoutComments = erd.replace(/<!--[\s\S]*?-->/g, "");
    expect(withoutComments, "add a ```mermaid block starting with erDiagram").toMatch(
      /```mermaid\s+erDiagram/,
    );
    for (const table of ["organizations", "users", "memberships", "rooms", "bookings", "booking_attendees"]) {
      expect(withoutComments, `ERD should include the ${table} table`).toMatch(new RegExp(`\\b${table}\\b`));
    }
    expect(withoutComments, "use relationship cardinalities like ||--o{").toMatch(/[|}o][|o]--[|o][|{o]/);
  });
});

// The runner is provided; these tests document how it behaves. They run in a separate schema.
describe("migration runner (provided)", () => {
  let client: pg.Client;
  let dir: string;

  beforeAll(async () => {
    client = await connect();
    await client.query("DROP SCHEMA IF EXISTS runner_test CASCADE; CREATE SCHEMA runner_test");
    await client.query("SET search_path TO runner_test");
    dir = await mkdtemp(join(tmpdir(), "wl12-migrations-"));
  });

  afterAll(async () => {
    await client.query("DROP SCHEMA IF EXISTS runner_test CASCADE");
    await client.end();
    await rm(dir, { recursive: true, force: true });
  });

  it("applies pending files in order, each once, and refuses edited history", async () => {
    await writeFile(join(dir, "001_a.sql"), "CREATE TABLE a (id int);");
    expect(await migrate(client, dir)).toEqual(["001_a.sql"]);

    await writeFile(join(dir, "002_b.sql"), "CREATE TABLE b (id int);");
    expect(await migrate(client, dir)).toEqual(["002_b.sql"]);
    expect(await migrate(client, dir)).toEqual([]);

    await writeFile(join(dir, "001_a.sql"), "CREATE TABLE a (id bigint);");
    await expect(migrate(client, dir)).rejects.toThrow(/changed after it was applied/);
    await writeFile(join(dir, "001_a.sql"), "CREATE TABLE a (id int);");
  });

  it("rolls back a failing migration completely", async () => {
    await writeFile(join(dir, "003_broken.sql"), "CREATE TABLE c (id int); SELECT * FROM nope;");
    await expect(migrate(client, dir)).rejects.toThrow(/003_broken\.sql failed/);
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_tables WHERE schemaname = 'runner_test' AND tablename = 'c'",
    );
    expect(rowCount, "table c must not exist: the migration was rolled back").toBe(0);
    await rm(join(dir, "003_broken.sql"));
  });
});
