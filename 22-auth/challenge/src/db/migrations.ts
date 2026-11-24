import type pg from "pg";

/**
 * Tiny forward-only migration list. Module 12 covers real migration tooling;
 * here we only need two tables.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email         text NOT NULL UNIQUE CHECK (email = lower(email)),
     password_hash text NOT NULL,
     role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title      text NOT NULL,
     body       text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (owner_id, created_at)`,
];

export async function migrate(pool: pg.Pool): Promise<void> {
  for (const sql of MIGRATIONS) await pool.query(sql);
}
