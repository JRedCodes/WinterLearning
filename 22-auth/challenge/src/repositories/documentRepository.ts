import type pg from "pg";
import type { Document, DocumentPatch, NewDocument } from "../domain/document.js";

/**
 * Pure data access: no authorization decisions in here. The repository will
 * happily return anyone's document; deciding who may see it is the service's job.
 */
export interface DocumentRepository {
  create(ownerId: string, input: NewDocument): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  listByOwner(ownerId: string): Promise<Document[]>;
  listAll(): Promise<Document[]>;
  update(id: string, patch: DocumentPatch): Promise<Document | null>;
  delete(id: string): Promise<boolean>;
}

interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

const toDocument = (r: DocumentRow): Document => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  body: r.body,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgDocumentRepository implements DocumentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(ownerId: string, { title, body }: NewDocument): Promise<Document> {
    const { rows } = await this.pool.query<DocumentRow>(
      `INSERT INTO documents (owner_id, title, body) VALUES ($1, $2, $3) RETURNING *`,
      [ownerId, title, body],
    );
    return toDocument(rows[0]!);
  }

  async findById(id: string): Promise<Document | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<DocumentRow>(`SELECT * FROM documents WHERE id = $1`, [id]);
    return rows[0] ? toDocument(rows[0]) : null;
  }

  async listByOwner(ownerId: string): Promise<Document[]> {
    const { rows } = await this.pool.query<DocumentRow>(
      `SELECT * FROM documents WHERE owner_id = $1 ORDER BY created_at, id`,
      [ownerId],
    );
    return rows.map(toDocument);
  }

  async listAll(): Promise<Document[]> {
    const { rows } = await this.pool.query<DocumentRow>(`SELECT * FROM documents ORDER BY created_at, id`);
    return rows.map(toDocument);
  }

  async update(id: string, patch: DocumentPatch): Promise<Document | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query<DocumentRow>(
      `UPDATE documents
          SET title = COALESCE($2, title),
              body = COALESCE($3, body),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, patch.title ?? null, patch.body ?? null],
    );
    return rows[0] ? toDocument(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const { rowCount } = await this.pool.query(`DELETE FROM documents WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}
