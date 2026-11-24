import type pg from "pg";
import type { User } from "../domain/types.js";

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  settings: Record<string, unknown>;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  isAdmin: r.is_admin,
  settings: r.settings,
});

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export class UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findByTokenHash(tokenHash: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT u.* FROM users u JOIN api_tokens t ON t.user_id = u.id WHERE t.token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  async findById(id: number): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  async list(): Promise<User[]> {
    const { rows } = await this.pool.query<UserRow>("SELECT * FROM users ORDER BY id");
    return rows.map(toUser);
  }

  /** Updates whichever fields are given. Keys are camelCase property names. */
  async update(id: number, fields: Record<string, unknown>): Promise<User> {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${toSnake(k)} = $${i + 2}`).join(", ");
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users SET ${sets} WHERE id = $1 RETURNING *`,
      [id, ...keys.map((k) => fields[k])],
    );
    return toUser(rows[0]!);
  }

  async saveSettings(id: number, settings: Record<string, unknown>): Promise<void> {
    await this.pool.query("UPDATE users SET settings = $2 WHERE id = $1", [id, JSON.stringify(settings)]);
  }
}
