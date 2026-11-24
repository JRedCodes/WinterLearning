import { randomUUID } from "node:crypto";
import type { Bookmark, BookmarkInput, BookmarkStore } from "./types.js";

/** Given, and working. Keeps bookmarks in a Map, in insertion order. */
export class InMemoryBookmarkStore implements BookmarkStore {
  readonly #items = new Map<string, Bookmark>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async list(filter: { tag?: string } = {}): Promise<Bookmark[]> {
    const all = [...this.#items.values()];
    const { tag } = filter;
    return tag === undefined ? all : all.filter((b) => b.tags.includes(tag));
  }

  async get(id: string): Promise<Bookmark | undefined> {
    return this.#items.get(id);
  }

  async create(input: BookmarkInput): Promise<Bookmark> {
    const at = this.now().toISOString();
    const bookmark: Bookmark = { id: randomUUID(), ...input, tags: [...input.tags], createdAt: at, updatedAt: at };
    this.#items.set(bookmark.id, bookmark);
    return bookmark;
  }

  async replace(id: string, input: BookmarkInput): Promise<Bookmark | undefined> {
    const existing = this.#items.get(id);
    if (!existing) return undefined;
    const updated: Bookmark = {
      ...existing,
      ...input,
      tags: [...input.tags],
      updatedAt: this.now().toISOString(),
    };
    this.#items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.#items.delete(id);
  }
}
