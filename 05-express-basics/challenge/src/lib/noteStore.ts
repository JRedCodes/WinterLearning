export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewNote {
  title: string;
  body: string;
}

/**
 * In-memory storage for notes.
 *
 * The methods are async on purpose: a real database call is async, and
 * this lets you practice handling promise rejections in Express.
 * (In module 13 you'll swap this for Postgres.)
 */
export class NoteStore {
  #notes = new Map<string, Note>();
  #seq = 0;

  async list(): Promise<Note[]> {
    return [...this.#notes.values()];
  }

  async get(id: string): Promise<Note | undefined> {
    return this.#notes.get(id);
  }

  async create(input: NewNote): Promise<Note> {
    const now = new Date().toISOString();
    const note: Note = { id: String(++this.#seq), ...input, createdAt: now, updatedAt: now };
    this.#notes.set(note.id, note);
    return note;
  }

  async update(id: string, patch: Partial<NewNote>): Promise<Note | undefined> {
    const existing = this.#notes.get(id);
    if (!existing) return undefined;
    const updated: Note = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.#notes.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.#notes.delete(id);
  }
}
