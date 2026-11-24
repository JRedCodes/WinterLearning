export interface User {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  createdAt: Date;
}

export interface AuthorSummary {
  id: string;
  handle: string;
  displayName: string;
}

/** A post as stored: includes the (potentially large) body. */
export interface Post {
  id: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

/** What list views show: never the full body. */
export interface PostSummary {
  id: string;
  authorId: string;
  excerpt: string;
  createdAt: Date;
}

export interface FeedItem {
  id: string;
  excerpt: string;
  createdAt: Date;
  author: AuthorSummary;
  commentCount: number;
}

export interface FeedPage {
  data: FeedItem[];
  /** Opaque token for the next page, or null on the last page. */
  nextCursor: string | null;
}

export interface PostDetail extends Post {
  author: AuthorSummary;
  commentCount: number;
}

/** Excerpts are the first 140 characters of the body. */
export const EXCERPT_LENGTH = 140;
