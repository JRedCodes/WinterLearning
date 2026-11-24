import type { User } from "../domain/user.js";
import type { Queues } from "./queues.js";
import { JOB, type EnqueuedJob, type JobProducer } from "./types.js";

/**
 * Turns "please send a welcome email to this user" into a BullMQ job.
 *
 * TODO(3): Make enqueueing idempotent.
 * Right now every call creates a new job with a random id, so a retried HTTP
 * request (or a double click) enqueues the same work twice.
 * Give each job a DETERMINISTIC `jobId` derived from what the job is about,
 * e.g. `${JOB.welcomeEmail}-${user.id}`. BullMQ ignores add() for a jobId
 * that already exists. (Don't use ":" in custom ids; BullMQ uses it in keys.)
 */
export class BullJobProducer implements JobProducer {
  constructor(private readonly queues: Queues) {}

  async enqueueWelcomeEmail(user: User): Promise<EnqueuedJob> {
    const job = await this.queues.emails.add(JOB.welcomeEmail, { userId: user.id });
    return { queue: this.queues.emails.name, id: job.id ?? "" };
  }

  async enqueueAvatarThumbnail(user: User): Promise<EnqueuedJob> {
    if (!user.avatarUrl) throw new Error(`user ${user.id} has no avatar to thumbnail`);
    const job = await this.queues.thumbnails.add(JOB.avatarThumbnail, { userId: user.id, imageUrl: user.avatarUrl });
    return { queue: this.queues.thumbnails.name, id: job.id ?? "" };
  }
}
