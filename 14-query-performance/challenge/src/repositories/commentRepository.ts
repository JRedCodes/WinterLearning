import type { Queryable } from "../db/pool.js";

export class CommentRepository {
  constructor(private readonly db: Queryable) {}

  async countForPost(postId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM comments WHERE post_id = $1",
      [postId],
    );
    return rows[0]?.n ?? 0;
  }
}
