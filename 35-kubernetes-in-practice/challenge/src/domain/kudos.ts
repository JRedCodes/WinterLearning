/** A public "thank you" from one teammate to another. */
export interface Kudos {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: string;
}

export interface NewKudos {
  from: string;
  to: string;
  message: string;
}

export class KudosNotFoundError extends Error {
  constructor(id: string) {
    super(`Kudos ${id} not found`);
    this.name = "KudosNotFoundError";
  }
}

export class InvalidKudosError extends Error {
  constructor(public readonly details: { path: string; message: string }[]) {
    super("Invalid kudos");
    this.name = "InvalidKudosError";
  }
}
