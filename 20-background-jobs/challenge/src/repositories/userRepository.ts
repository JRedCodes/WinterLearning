import { randomUUID } from "node:crypto";
import { DuplicateEmailError, UserNotFoundError, type NewUser, type User } from "../domain/user.js";

export interface UserRepository {
  create(input: NewUser): Promise<User>;
  findById(id: string): Promise<User | undefined>;
  setAvatarThumbnail(id: string, thumbnailUrl: string): Promise<User>;
}

/**
 * In-memory for this module (Postgres was modules 11–16; the interesting part
 * here is the queue). Because it's in memory, the API and the workers must run
 * in the same process. See server.ts.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async create(input: NewUser): Promise<User> {
    const email = input.email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === email) throw new DuplicateEmailError(email);
    }
    const user: User = {
      id: randomUUID(),
      email,
      name: input.name,
      avatarUrl: input.avatarUrl ?? null,
      avatarThumbnailUrl: null,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async findById(id: string): Promise<User | undefined> {
    const u = this.users.get(id);
    return u ? { ...u } : undefined;
  }

  async setAvatarThumbnail(id: string, thumbnailUrl: string): Promise<User> {
    const u = this.users.get(id);
    if (!u) throw new UserNotFoundError(id);
    u.avatarThumbnailUrl = thumbnailUrl;
    return { ...u };
  }
}
