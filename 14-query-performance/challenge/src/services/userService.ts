import { UserNotFoundError } from "../domain/errors.js";
import type { PostSummary, User } from "../domain/types.js";
import type { PostRepository } from "../repositories/postRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly posts: PostRepository,
  ) {}

  async lookupByEmail(email: string): Promise<User> {
    const user = await this.users.findByEmail(email.trim());
    if (!user) throw new UserNotFoundError("no user with that email");
    return user;
  }

  async timeline(userId: string, limit: number): Promise<PostSummary[]> {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError(`user ${userId} not found`);
    return this.posts.listByAuthor(userId, limit);
  }
}
