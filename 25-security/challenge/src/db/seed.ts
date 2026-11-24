// `make seed`: creates the tables and three demo users with known tokens, for manual testing with curl.
import pg from "pg";
import { loadConfig } from "../config.js";
import { hashToken } from "../lib/tokens.js";
import { migrate } from "./migrate.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool);
const users = [
  { email: "alice@example.com", name: "Alice", admin: false, token: "alice-dev-token" },
  { email: "bob@example.com", name: "Bob", admin: false, token: "bob-dev-token" },
  { email: "root@example.com", name: "Root", admin: true, token: "admin-dev-token" },
];
for (const u of users) {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, display_name, is_admin) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    [u.email, u.name, u.admin],
  );
  await pool.query("INSERT INTO api_tokens (token_hash, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    hashToken(u.token),
    rows[0]!.id,
  ]);
  console.log(`${u.email.padEnd(20)} Authorization: Bearer ${u.token}`);
}
await pool.end();
