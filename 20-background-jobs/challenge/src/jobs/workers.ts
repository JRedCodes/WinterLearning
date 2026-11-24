import { Worker, type Job } from "bullmq";
import type { BullConnection } from "../lib/redis.js";
import { computeBackoff } from "./backoff.js";
import { withDeadLetter, type DeadLetterSink } from "./deadLetter.js";
import type { AvatarThumbnailData, JobSettings, QueueNames, WelcomeEmailData } from "./types.js";

export interface WorkerDeps {
  connection: BullConnection;
  prefix: string;
  names: QueueNames;
  settings: JobSettings;
  concurrency: { email: number; thumbnail: number };
  deadLetter: DeadLetterSink;
  processors: {
    welcomeEmail: (job: Job<WelcomeEmailData>) => Promise<unknown>;
    avatarThumbnail: (job: Job<AvatarThumbnailData>) => Promise<unknown>;
  };
  /** Called for every failed attempt (logging/metrics). Default: console.warn. */
  onFailed?: (queue: string, job: Job | undefined, err: Error) => void;
}

export interface RunningWorkers {
  workers: Worker[];
  /** Stop taking new jobs, wait for active ones to finish, disconnect. */
  close(): Promise<void>;
}

export function startWorkers(deps: WorkerDeps): RunningWorkers {
  const { connection, prefix, names, settings, concurrency, deadLetter, processors } = deps;
  const onFailed =
    deps.onFailed ??
    ((queue, job, err) => console.warn(`[${queue}] job ${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`));

  const workerSettings = {
    backoffStrategy: (attemptsMade: number) => computeBackoff(attemptsMade, settings.backoff),
  };

  const email = new Worker<WelcomeEmailData>(names.emails, withDeadLetter(processors.welcomeEmail, deadLetter), {
    connection,
    prefix,
    concurrency: concurrency.email,
    settings: workerSettings,
  });
  const thumbnails = new Worker<AvatarThumbnailData>(
    names.thumbnails,
    withDeadLetter(processors.avatarThumbnail, deadLetter),
    { connection, prefix, concurrency: concurrency.thumbnail, settings: workerSettings },
  );

  const workers: Worker[] = [email, thumbnails];
  for (const w of workers) {
    w.on("failed", (job, err) => onFailed(w.name, job, err));
    // Without an "error" listener, a Redis hiccup becomes an unhandled 'error' event.
    w.on("error", (err) => console.error(`[${w.name}] worker error`, err));
  }

  let closing: Promise<void> | undefined;
  return {
    workers,
    close() {
      // TODO(8): Graceful shutdown.
      // Ops ticket: "after every deploy, a few thumbnail jobs show up as
      // stalled and get processed twice; some emails go out twice."
      // This force-closes: it disconnects immediately, abandoning jobs that
      // are halfway through. Read the Worker.close() docs: how do you make
      // it wait for active jobs to finish? (Keep the `closing ??=` guard so
      // calling close() twice is safe.)
      closing ??= Promise.all(workers.map((w) => w.close(true))).then(() => undefined);
      return closing;
    },
  };
}
