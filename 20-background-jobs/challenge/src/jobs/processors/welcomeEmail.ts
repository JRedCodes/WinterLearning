import type { EmailSender } from "../../domain/ports.js";
import type { UserRepository } from "../../repositories/userRepository.js";
import type { IdempotencyStore } from "../idempotency.js";
import type { WelcomeEmailData } from "../types.js";

export interface WelcomeEmailDeps {
  users: UserRepository;
  email: EmailSender;
  idempotency: IdempotencyStore;
  /** How long a claim protects an in-flight send. Longer than a send ever takes. */
  leaseMs?: number;
  /** How long we remember "already sent". */
  doneTtlMs?: number;
}

export interface WelcomeEmailResult {
  status: "sent" | "skipped";
}

/**
 * TODO(5): Make this processor safe to run more than once.
 *
 * BullMQ delivers AT LEAST once: this function can run twice for the same
 * user (a retry after a send that timed out but actually went through, a
 * stalled job picked up again, two jobs enqueued for one user). Today that
 * sends two welcome emails.
 *
 * 1. Missing user → throw UnrecoverableError (from "bullmq"): retrying
 *    won't make the user appear.
 * 2. Claim the key `welcome-email:${user.id}` (the business fact, NOT the
 *    job id) with deps.idempotency:
 *      "done" → return { status: "skipped" } without sending
 *      "busy" → throw a normal Error (BullMQ will retry later)
 * 3. Send. If sending throws, release() the claim, then rethrow.
 * 4. On success complete() the claim, return { status: "sent" }.
 * Pass the same key as the message's idempotencyKey.
 */
export function createWelcomeEmailProcessor(deps: WelcomeEmailDeps) {
  return async (job: { data: WelcomeEmailData }): Promise<WelcomeEmailResult> => {
    const user = await deps.users.findById(job.data.userId);
    if (!user) throw new Error(`user ${job.data.userId} not found`);

    await deps.email.send({
      to: user.email,
      subject: `Welcome, ${user.name}!`,
      body: `Hi ${user.name}, thanks for signing up.`,
      idempotencyKey: `welcome-email:${user.id}`,
    });
    return { status: "sent" };
  };
}
