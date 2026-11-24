import type { Queryable } from "../db/pool.js";
import type { User } from "../domain/types.js";

interface UserRow {
  id: string;
  email: string;
  handle: string;
  display_name: string;
  created_at: Date;
}

const USER_COLUMNS = "id, email, handle, display_name, created_at";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** Emails are matched case-insensitively ("Ada@Example.com" == "ada@example.com"). */
  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }
}
