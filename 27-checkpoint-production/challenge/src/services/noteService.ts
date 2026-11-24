import { NoteNotFoundError, type Note } from "../domain/note.js";
import type { NoteRepository } from "../repositories/noteRepository.js";

export class NoteService {
  constructor(private readonly notes: NoteRepository) {}

  create(input: { title: string; body?: string }): Promise<Note> {
    return this.notes.create(input);
  }

  list(): Promise<Note[]> {
    return this.notes.list();
  }

  async get(id: string): Promise<Note> {
    const note = await this.notes.findById(id);
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }

  async update(id: string, patch: { title?: string; body?: string }): Promise<Note> {
    const note = await this.notes.update(id, patch);
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.notes.delete(id))) throw new NoteNotFoundError(id);
  }
}
