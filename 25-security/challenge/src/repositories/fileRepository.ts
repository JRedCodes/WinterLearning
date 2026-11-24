import type pg from "pg";
import type { FileRecord } from "../domain/types.js";

interface FileRow {
  id: number;
  owner_id: number;
  name: string;
  size_bytes: number;
  content_type: string;
  created_at: Date;
}

const toFile = (r: FileRow): FileRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  sizeBytes: r.size_bytes,
  contentType: r.content_type,
  createdAt: r.created_at.toISOString(),
});

export class FileRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(file: { ownerId: number; name: string; sizeBytes: number; contentType: string }): Promise<FileRecord> {
    const { rows } = await this.pool.query<FileRow>(
      `INSERT INTO files (owner_id, name, size_bytes, content_type) VALUES ($1, $2, $3, $4) RETURNING *`,
      [file.ownerId, file.name, file.sizeBytes, file.contentType],
    );
    return toFile(rows[0]!);
  }

  async findByName(ownerId: number, name: string): Promise<FileRecord | undefined> {
    const { rows } = await this.pool.query<FileRow>("SELECT * FROM files WHERE owner_id = $1 AND name = $2", [
      ownerId,
      name,
    ]);
    return rows[0] ? toFile(rows[0]) : undefined;
  }

  /** The owner's files, optionally filtered by a case-insensitive substring of the name. */
  async search(ownerId: number, term?: string): Promise<FileRecord[]> {
    let sql = `SELECT * FROM files WHERE owner_id = ${ownerId}`;
    if (term) sql += ` AND name ILIKE '%${term}%'`;
    sql += " ORDER BY name";
    const { rows } = await this.pool.query<FileRow>(sql);
    return rows.map(toFile);
  }
}
