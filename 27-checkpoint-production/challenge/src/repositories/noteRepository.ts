import type pg from "pg";
import type { Note } from "../domain/note.js";

export interface NoteRepository {
  create(input: { title: string; body?: string }): Promise<Note>;
  list(): Promise<Note[]>;
  findById(id: string): Promise<Note | undefined>;
  update(id: string, patch: { title?: string; body?: string }): Promise<Note | undefined>;
  delete(id: string): Promise<boolean>;
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class PgNoteRepository implements NoteRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: { title: string; body?: string }): Promise<Note> {
    const { rows } = await this.pool.query<NoteRow>(
      "INSERT INTO notes (title, body) VALUES ($1, COALESCE($2, '')) RETURNING *",
      [input.title, input.body ?? null],
    );
    return toNote(rows[0]!);
  }

  async list(): Promise<Note[]> {
    const { rows } = await this.pool.query<NoteRow>("SELECT * FROM notes ORDER BY created_at, id");
    return rows.map(toNote);
  }

  async findById(id: string): Promise<Note | undefined> {
    const { rows } = await this.pool.query<NoteRow>("SELECT * FROM notes WHERE id = $1", [id]);
    return rows[0] ? toNote(rows[0]) : undefined;
  }

  async update(id: string, patch: { title?: string; body?: string }): Promise<Note | undefined> {
    const { rows } = await this.pool.query<NoteRow>(
      `UPDATE notes SET title = COALESCE($2, title), body = COALESCE($3, body), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.title ?? null, patch.body ?? null],
    );
    return rows[0] ? toNote(rows[0]) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM notes WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  }
}
