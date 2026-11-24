import type pg from "pg";
import { EmailTakenError } from "../domain/errors.js";
import type { Role, User } from "../domain/user.js";

export interface NewUserRecord {
  email: string; // already normalized
  passwordHash: string;
  role?: Role;
}

export interface UserRepository {
  create(input: NewUserRecord): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  role: r.role,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create({ email, passwordHash, role = "user" }: NewUserRecord): Promise<User> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *`,
        [email, passwordHash, role],
      );
      return toUser(rows[0]!);
    } catch (err) {
      // Let the UNIQUE constraint be the source of truth: a "SELECT then INSERT"
      // check in the service would race when two signups arrive at once.
      if ((err as { code?: string }).code === "23505") throw new EmailTakenError();
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async list(): Promise<User[]> {
    const { rows } = await this.pool.query<UserRow>(`SELECT * FROM users ORDER BY created_at, email`);
    return rows.map(toUser);
  }
}
