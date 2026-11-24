import type { NewUser, User } from "../domain/user.js";
import type { EnqueuedJob, JobProducer } from "../jobs/types.js";
import type { UserRepository } from "../repositories/userRepository.js";

export interface SignupResult {
  user: User;
  jobs: EnqueuedJob[];
}

/**
 * Signup does the minimum synchronously (create the user) and pushes slow,
 * failure-prone work (email, image processing) onto queues. The HTTP response
 * doesn't wait for an email provider that might take 3 seconds or be down.
 */
export class SignupService {
  constructor(
    private readonly users: UserRepository,
    private readonly jobs: JobProducer,
  ) {}

  async signup(input: NewUser): Promise<SignupResult> {
    const user = await this.users.create(input);
    const jobs = [await this.jobs.enqueueWelcomeEmail(user)];
    if (user.avatarUrl) jobs.push(await this.jobs.enqueueAvatarThumbnail(user));
    // ⚠️ If the process dies between create() and enqueue, the user exists
    // but no email is ever sent. With a real database, the fix is the
    // transactional OUTBOX pattern (module 33). See the lesson, section 9.
    return { user, jobs };
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.findById(id);
  }
}
