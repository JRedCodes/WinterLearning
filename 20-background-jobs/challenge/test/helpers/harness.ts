import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { createApp } from "../../src/app.js";
import { connectionFromUrl } from "../../src/lib/redis.js";
import { InMemoryUserRepository } from "../../src/repositories/userRepository.js";
import { SignupService } from "../../src/services/signupService.js";
import { queueNames, type JobSettings } from "../../src/jobs/types.js";
import { createQueues } from "../../src/jobs/queues.js";
import { BullJobProducer } from "../../src/jobs/producer.js";
import { RedisIdempotencyStore } from "../../src/jobs/idempotency.js";
import { createWelcomeEmailProcessor } from "../../src/jobs/processors/welcomeEmail.js";
import { createAvatarThumbnailProcessor } from "../../src/jobs/processors/avatarThumbnail.js";
import { startWorkers } from "../../src/jobs/workers.js";
import { FakeEmailSender, FakeThumbnailer } from "./fakes.js";
import { deletePrefix, REDIS_URL, testRedis } from "./redis.js";

export const TEST_SETTINGS: JobSettings = { attempts: 3, backoff: { baseMs: 20, maxMs: 50 } };

/**
 * Wires the whole system the way server.ts does, but on queues unique to one
 * test (namespace) and with fakes for the outside world.
 */
export async function startHarness(opts: { email?: FakeEmailSender; thumbnailer?: FakeThumbnailer } = {}) {
  const redis: Redis = await testRedis();
  const ns = `t${randomUUID().slice(0, 8)}`;
  const connection = connectionFromUrl(REDIS_URL);
  const prefix = "wl:20";
  const idemPrefix = `wl:20:test:${ns}:idem:`;

  const users = new InMemoryUserRepository();
  const email = opts.email ?? new FakeEmailSender();
  const thumbnailer = opts.thumbnailer ?? new FakeThumbnailer();
  const queues = createQueues({ connection, prefix, names: queueNames(ns), settings: TEST_SETTINGS });
  const producer = new BullJobProducer(queues);
  const signupService = new SignupService(users, producer);
  const app = createApp({ signupService });
  const failures: string[] = [];

  const workers = startWorkers({
    connection,
    prefix,
    names: queues.names,
    settings: TEST_SETTINGS,
    concurrency: { email: 5, thumbnail: 2 },
    deadLetter: queues.deadLetter,
    processors: {
      welcomeEmail: createWelcomeEmailProcessor({
        users,
        email,
        idempotency: new RedisIdempotencyStore(redis, idemPrefix),
      }),
      avatarThumbnail: createAvatarThumbnailProcessor({ users, thumbnailer }),
    },
    onFailed: (_q, _job, err) => failures.push(err.message),
  });
  await Promise.all(workers.workers.map((w) => w.waitUntilReady()));

  return {
    app,
    users,
    email,
    thumbnailer,
    queues,
    producer,
    workers,
    failures,
    async teardown() {
      await workers.close();
      await Promise.all([
        queues.emails.obliterate({ force: true }),
        queues.thumbnails.obliterate({ force: true }),
        queues.deadLetter.obliterate({ force: true }),
      ]);
      await queues.close();
      await deletePrefix(redis, idemPrefix);
      redis.disconnect();
    },
  };
}
export type Harness = Awaited<ReturnType<typeof startHarness>>;
