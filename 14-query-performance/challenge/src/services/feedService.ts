import { z } from "zod";
import { PostNotFoundError, UserNotFoundError } from "../domain/errors.js";
import { EXCERPT_LENGTH, type FeedItem, type FeedPage, type PostDetail } from "../domain/types.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import type { CommentRepository } from "../repositories/commentRepository.js";
import type { PostRepository } from "../repositories/postRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";

const FeedCursor = z.object({ offset: z.number().int().min(0) });

export class FeedService {
  constructor(
    private readonly posts: PostRepository,
    private readonly users: UserRepository,
    private readonly comments: CommentRepository,
  ) {}

  /** The global feed: newest posts first, with author and comment count. */
  async getFeed({ limit, cursor }: { limit: number; cursor?: string }): Promise<FeedPage> {
    const { offset } = cursor ? decodeCursor(cursor, FeedCursor) : { offset: 0 };

    // Fetch one extra row to know whether there's a next page.
    const posts = await this.posts.listRecent(limit + 1, offset);
    const page = posts.slice(0, limit);

    const data: FeedItem[] = [];
    for (const post of page) {
      const author = await this.users.findById(post.authorId);
      if (!author) throw new UserNotFoundError(`author ${post.authorId} missing`);
      const commentCount = await this.comments.countForPost(post.id);
      data.push({
        id: post.id,
        excerpt: post.body.slice(0, EXCERPT_LENGTH),
        createdAt: post.createdAt,
        author: { id: author.id, handle: author.handle, displayName: author.displayName },
        commentCount,
      });
    }

    const nextCursor = posts.length > limit ? encodeCursor({ offset: offset + limit }) : null;
    return { data, nextCursor };
  }

  async getPost(id: string): Promise<PostDetail> {
    const post = await this.posts.findById(id);
    if (!post) throw new PostNotFoundError(`post ${id} not found`);
    const [author, commentCount] = await Promise.all([
      this.users.findById(post.authorId),
      this.comments.countForPost(post.id),
    ]);
    if (!author) throw new UserNotFoundError(`author ${post.authorId} missing`);
    return {
      ...post,
      author: { id: author.id, handle: author.handle, displayName: author.displayName },
      commentCount,
    };
  }
}
