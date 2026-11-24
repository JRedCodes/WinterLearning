export interface User {
  id: string;
  email: string;
  name: string;
  /** Original avatar the user uploaded (a URL), if any. */
  avatarUrl: string | null;
  /** Filled in later by the thumbnail job. */
  avatarThumbnailUrl: string | null;
  createdAt: string;
}

export interface NewUser {
  email: string;
  name: string;
  avatarUrl?: string | undefined;
}

export class DuplicateEmailError extends Error {
  constructor(readonly email: string) {
    super(`A user with email ${email} already exists`);
    this.name = "DuplicateEmailError";
  }
}

export class UserNotFoundError extends Error {
  constructor(readonly userId: string) {
    super(`User ${userId} not found`);
    this.name = "UserNotFoundError";
  }
}
