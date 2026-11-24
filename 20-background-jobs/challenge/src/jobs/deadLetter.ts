import type { Job } from "bullmq";
import type { DeadLetterData } from "./types.js";

/** Anything we can add a dead letter to (a BullMQ Queue, or a fake in tests). */
export interface DeadLetterSink {
  add(name: string, data: DeadLetterData, opts?: { jobId?: string }): Promise<unknown>;
}

/**
 * TODO(7a): Is this failure the last one?
 * - an UnrecoverableError is always final
 * - otherwise final when job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
 *   (inside a processor, attemptsMade counts attempts BEFORE the current one)
 */
export function isFinalAttempt(job: Pick<Job, "attemptsMade" | "opts">, err: unknown): boolean {
  void [job, err];
  throw new Error("Not implemented: isFinalAttempt (TODO 7)");
}

/**
 * TODO(7b): Dead-letter queue.
 *
 * Today a job that exhausts its retries just sits in the "failed" set of its
 * own queue, mixed with everything else, until removeOnFail deletes it.
 *
 * Wrap the processor: call it; if it throws AND isFinalAttempt(job, err),
 * add a DeadLetterData record to `sink` (name "dead-letter", jobId
 * `${job.queueName}-${job.id}` so it's never duplicated). Fields:
 * originalQueue, originalJobId, name, data, failedReason (err.message),
 * attemptsMade (INCLUDING this attempt), failedAt (ISO string).
 * Always rethrow the original error so BullMQ marks the job failed.
 * If writing to the sink fails, call onSinkError; don't swallow the original error.
 */
export function withDeadLetter<T, R>(
  processor: (job: Job<T>) => Promise<R>,
  sink: DeadLetterSink,
  onSinkError: (err: unknown) => void = (e) => console.error("[dlq] failed to write dead letter", e),
): (job: Job<T>) => Promise<R> {
  void [sink, onSinkError];
  return processor;
}
