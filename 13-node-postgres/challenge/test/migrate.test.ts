import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { migrate } from "../src/db/migrate.js";
import { MIGRATIONS_DIR, createTestPool, resetSchema } from "./helpers/db.js";

let pool: pg.Pool;
let dir: string;

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query<{ t: string | null }>("SELECT to_regclass($1) AS t", [name]);
  return rows[0]?.t !== null;
}

async function recordedVersions(): Promise<string[]> {
  const { rows } = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  return rows.map((r) => r.version);
}

beforeAll(() => {
  pool = createTestPool();
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await resetSchema(pool);
  dir = await mkdtemp(join(tmpdir(), "wl13-migrations-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("migrate() (TODO 5)", () => {
  it("applies migrations in filename order and records them", async () => {
    // Written out of order on purpose; 002 depends on 001.
    await writeFile(join(dir, "002_add_birds.sql"), "INSERT INTO birds (name) VALUES ('robin');");
    await writeFile(join(dir, "001_create_birds.sql"), "CREATE TABLE birds (name text NOT NULL);");
    await writeFile(join(dir, "010_create_nests.sql"), "CREATE TABLE nests (id int);");

    const applied = await migrate(pool, { dir });

    expect(applied).toEqual(["001_create_birds", "002_add_birds", "010_create_nests"]);
    expect(await recordedVersions()).toEqual(applied);
    const { rows } = await pool.query("SELECT name FROM birds");
    expect(rows).toEqual([{ name: "robin" }]);
  });

  it("is idempotent: a second run applies nothing", async () => {
    await writeFile(join(dir, "001_create_birds.sql"), "CREATE TABLE birds (name text);");
    await migrate(pool, { dir });
    expect(await migrate(pool, { dir })).toEqual([]);
    expect(await recordedVersions()).toEqual(["001_create_birds"]);
  });

  it("applies only new migrations on a later run", async () => {
    await writeFile(join(dir, "001_create_birds.sql"), "CREATE TABLE birds (name text);");
    await migrate(pool, { dir });
    await writeFile(join(dir, "002_create_nests.sql"), "CREATE TABLE nests (id int);");
    expect(await migrate(pool, { dir })).toEqual(["002_create_nests"]);
  });

  it("runs files that contain several statements", async () => {
    await writeFile(
      join(dir, "001_multi.sql"),
      "CREATE TABLE a (id int);\nCREATE TABLE b (id int);\nINSERT INTO a VALUES (1);",
    );
    await migrate(pool, { dir });
    expect(await tableExists("a")).toBe(true);
    expect(await tableExists("b")).toBe(true);
  });

  it("ignores files that aren't migrations", async () => {
    await writeFile(join(dir, "001_create_birds.sql"), "CREATE TABLE birds (name text);");
    await writeFile(join(dir, "README.md"), "# not sql");
    await writeFile(join(dir, "notes.sql"), "THIS IS NOT VALID SQL;");
    expect(await migrate(pool, { dir })).toEqual(["001_create_birds"]);
  });

  it("rolls back a failing migration completely, doesn't record it, and names the file", async () => {
    await writeFile(join(dir, "001_ok.sql"), "CREATE TABLE ok (id int);");
    // First statement succeeds, second fails: the table must NOT survive.
    await writeFile(join(dir, "002_broken.sql"), "CREATE TABLE half_done (id int);\nSELECT 1/0;");
    await writeFile(join(dir, "003_never.sql"), "CREATE TABLE never (id int);");

    await expect(migrate(pool, { dir })).rejects.toThrow(/002_broken/);

    expect(await tableExists("ok"), "earlier migrations stay applied").toBe(true);
    expect(await tableExists("half_done"), "the failed migration must be rolled back").toBe(false);
    expect(await tableExists("never"), "later migrations must not run").toBe(false);
    expect(await recordedVersions()).toEqual(["001_ok"]);
  });

  it("applies this module's real migrations", async () => {
    const applied = await migrate(pool, { dir: MIGRATIONS_DIR });
    expect(applied).toEqual(["001_create_projects", "002_create_tasks"]);
    expect(await tableExists("projects")).toBe(true);
    expect(await tableExists("tasks")).toBe(true);
  });
});
