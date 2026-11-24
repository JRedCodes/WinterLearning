export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export class NoteNotFoundError extends Error {
  constructor(public readonly noteId: string) {
    super(`Note ${noteId} not found`);
    this.name = "NoteNotFoundError";
  }
}
