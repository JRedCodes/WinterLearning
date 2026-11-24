import type pg from "pg";
import type { Kudos, NewKudos } from "../domain/kudos.js";
import type { KudosRepository } from "./kudosRepository.js";

interface KudosRow {
  id: string; // bigint comes back as a string from pg
  from_name: string;
  to_name: string;
  message: string;
  created_at: Date;
}

const COLUMNS = "id, from_name, to_name, message, created_at";

function toKudos(row: KudosRow): Kudos {
  return {
    id: row.id,
    from: row.from_name,
    to: row.to_name,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  };
}

export class PgKudosRepository implements KudosRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: NewKudos): Promise<Kudos> {
    const { rows } = await this.pool.query<KudosRow>(
      `INSERT INTO kudos (from_name, to_name, message) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [input.from, input.to, input.message],
    );
    return toKudos(rows[0]!);
  }

  async findById(id: string): Promise<Kudos | undefined> {
    if (!/^\d{1,18}$/.test(id)) return undefined;
    const { rows } = await this.pool.query<KudosRow>(`SELECT ${COLUMNS} FROM kudos WHERE id = $1`, [id]);
    return rows[0] ? toKudos(rows[0]) : undefined;
  }

  async listRecent(limit: number): Promise<Kudos[]> {
    const { rows } = await this.pool.query<KudosRow>(
      `SELECT ${COLUMNS} FROM kudos ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toKudos);
  }
}
