import type { Queryable } from "../db/pool.js";
import { EXCERPT_LENGTH, type Post, type PostSummary } from "../domain/types.js";

interface PostRow {
  id: string;
  author_id: string;
  body: string;
  created_at: Date;
}

interface PostSummaryRow {
  id: string;
  author_id: string;
  excerpt: string;
  created_at: Date;
}

function toPost(row: PostRow): Post {
  return { id: row.id, authorId: row.author_id, body: row.body, createdAt: row.created_at };
}

function toSummary(row: PostSummaryRow): PostSummary {
  return { id: row.id, authorId: row.author_id, excerpt: row.excerpt, createdAt: row.created_at };
}

export class PostRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<Post | null> {
    const { rows } = await this.db.query<PostRow>(
      "SELECT id, author_id, body, created_at FROM posts WHERE id = $1",
      [id],
    );
    return rows[0] ? toPost(rows[0]) : null;
  }

  /** An author's latest posts, newest first. */
  async listByAuthor(authorId: string, limit: number): Promise<PostSummary[]> {
    const { rows } = await this.db.query<PostSummaryRow>(
      `SELECT id, author_id, left(body, ${EXCERPT_LENGTH}) AS excerpt, created_at
         FROM posts
        WHERE author_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [authorId, limit],
    );
    return rows.map(toSummary);
  }

  /** All posts, newest first, one page at a time. */
  async listRecent(limit: number, offset: number): Promise<Post[]> {
    const { rows } = await this.db.query<PostRow>(
      `SELECT * FROM posts
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toPost);
  }
}
