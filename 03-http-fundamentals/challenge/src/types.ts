import type { IncomingMessage, ServerResponse } from "node:http";

/** A saved link. This is what the API returns. */
export interface Bookmark {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

/** What a client may send on POST/PUT, after validation. */
export interface BookmarkInput {
  readonly url: string;
  readonly title: string;
  readonly tags: readonly string[];
}

/** Storage for bookmarks. The server only talks to this interface. */
export interface BookmarkStore {
  list(filter?: { tag?: string }): Promise<Bookmark[]>;
  get(id: string): Promise<Bookmark | undefined>;
  create(input: BookmarkInput): Promise<Bookmark>;
  /** Replaces an existing bookmark. Returns undefined if it doesn't exist. */
  replace(id: string, input: BookmarkInput): Promise<Bookmark | undefined>;
  /** Returns false if it didn't exist. */
  delete(id: string): Promise<boolean>;
}

export interface ServerOptions {
  /** Defaults to a fresh InMemoryBookmarkStore. */
  store?: BookmarkStore;
  /** Largest accepted request body in bytes. Default 10 KiB (10_240). */
  maxBodyBytes?: number;
}

/** Everything a route handler needs about the current request. */
export interface RequestContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  /** The parsed request URL (path + query string). */
  readonly url: URL;
  /** Values of `:name` segments in the matched route pattern, URL-decoded. */
  readonly params: Readonly<Record<string, string>>;
}

export type RouteHandler = (ctx: RequestContext) => void | Promise<void>;
