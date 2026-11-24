import { NotFoundError } from "../domain/errors.js";
import type { User } from "../domain/types.js";
import { deepMerge } from "../lib/deepMerge.js";
import type { UserRepository } from "../repositories/userRepository.js";

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async get(id: number): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  listAll(): Promise<User[]> {
    return this.users.list();
  }

  updateProfile(id: number, changes: Record<string, unknown>): Promise<User> {
    return this.users.update(id, changes);
  }

  /** Partial update: merges the patch into the stored settings. */
  async updateSettings(id: number, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const user = await this.get(id);
    const merged = deepMerge(user.settings, patch);
    await this.users.saveSettings(id, merged);
    return merged;
  }
}
