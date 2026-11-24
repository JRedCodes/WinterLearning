import { toPublicUser, type PublicUser } from "../domain/user.js";
import type { UserRepository } from "../repositories/userRepository.js";

/** Admin-facing user queries. Authorization for these is enforced by requireRole("admin") on the route. */
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async listUsers(): Promise<PublicUser[]> {
    return (await this.users.list()).map(toPublicUser);
  }
}
