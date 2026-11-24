import type { User } from "../domain/user.js";

/**
 * Queue names. A `namespace` lets tests run each case on its own queues
 * (queue names may not contain ":"). Production uses the default.
 */
export function queueNames(namespace = "app") {
  return {
    emails: `${namespace}-emails`,
    thumbnails: `${namespace}-thumbnails`,
    deadLetter: `${namespace}-dead-letter`,
  } as const;
}
export type QueueNames = ReturnType<typeof queueNames>;

export const JOB = {
  welcomeEmail: "welcome-email",
  avatarThumbnail: "avatar-thumbnail",
} as const;

/** Job payloads: small, JSON-serializable, ids rather than whole objects. */
export interface WelcomeEmailData {
  userId: string;
}
export interface AvatarThumbnailData {
  userId: string;
  imageUrl: string;
}

/** What lands in the dead-letter queue when a job fails for good. */
export interface DeadLetterData {
  originalQueue: string;
  originalJobId: string;
  name: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

export interface BackoffSettings {
  /** Delay before the first retry, before jitter. */
  baseMs: number;
  /** Upper bound for any single delay. */
  maxMs: number;
}

export interface JobSettings {
  /** Total tries per job, including the first one. */
  attempts: number;
  backoff: BackoffSettings;
}

export interface EnqueuedJob {
  queue: string;
  id: string;
}

/**
 * The port the service layer uses to schedule work. The signup service has
 * no idea BullMQ exists; it just says "make sure this happens".
 */
export interface JobProducer {
  enqueueWelcomeEmail(user: User): Promise<EnqueuedJob>;
  enqueueAvatarThumbnail(user: User): Promise<EnqueuedJob>;
}
