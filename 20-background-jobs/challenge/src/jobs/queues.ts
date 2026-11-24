import { Queue, type DefaultJobOptions } from "bullmq";
import type { BullConnection } from "../lib/redis.js";
import type { AvatarThumbnailData, DeadLetterData, JobSettings, QueueNames, WelcomeEmailData } from "./types.js";

/**
 * TODO(2): Options every job gets unless it overrides them.
 *
 * Right now jobs get ONE attempt and are kept in Redis forever. Return:
 * - attempts: settings.attempts
 * - backoff: { type: "custom" }  → BullMQ then asks the Worker's
 *   settings.backoffStrategy for the delay (already wired in workers.ts)
 * - removeOnComplete: keep a BOUNDED history ({ count, age }), not forever,
 *   and not `true` (that deletes immediately: nothing to inspect, and jobId
 *   dedupe in producer.ts only works while the job still exists)
 * - removeOnFail: also bounded, but keep failed jobs longer; they're what you debug
 */
export function defaultJobOptions(settings: JobSettings): DefaultJobOptions {
  void settings;
  return {};
}

export interface Queues {
  names: QueueNames;
  emails: Queue<WelcomeEmailData>;
  thumbnails: Queue<AvatarThumbnailData>;
  deadLetter: Queue<DeadLetterData>;
  close(): Promise<void>;
}

export interface CreateQueuesOptions {
  connection: BullConnection;
  prefix: string;
  names: QueueNames;
  settings: JobSettings;
}

export function createQueues({ connection, prefix, names, settings }: CreateQueuesOptions): Queues {
  const defaults = defaultJobOptions(settings);
  const emails = new Queue<WelcomeEmailData>(names.emails, { connection, prefix, defaultJobOptions: defaults });
  const thumbnails = new Queue<AvatarThumbnailData>(names.thumbnails, { connection, prefix, defaultJobOptions: defaults });
  // Dead letters are never retried or auto-removed: a human (or a replay
  // script) decides what happens to them.
  const deadLetter = new Queue<DeadLetterData>(names.deadLetter, {
    connection,
    prefix,
    defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
  });

  return {
    names,
    emails,
    thumbnails,
    deadLetter,
    async close() {
      await Promise.all([emails.close(), thumbnails.close(), deadLetter.close()]);
    },
  };
}
