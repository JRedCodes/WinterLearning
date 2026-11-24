import { loadConfig } from "./config.js";
import { connectionFromUrl, connectRedis } from "./lib/redis.js";
import { createApp } from "./app.js";
import { InMemoryUserRepository } from "./repositories/userRepository.js";
import { SignupService } from "./services/signupService.js";
import { ConsoleEmailSender } from "./adapters/consoleEmailSender.js";
import { FakeThumbnailer } from "./adapters/fakeThumbnailer.js";
import { queueNames } from "./jobs/types.js";
import { createQueues } from "./jobs/queues.js";
import { BullJobProducer } from "./jobs/producer.js";
import { RedisIdempotencyStore } from "./jobs/idempotency.js";
import { createWelcomeEmailProcessor } from "./jobs/processors/welcomeEmail.js";
import { createAvatarThumbnailProcessor } from "./jobs/processors/avatarThumbnail.js";
import { startWorkers } from "./jobs/workers.js";

/**
 * Composition root.
 *
 * In production the API and the workers are usually SEPARATE deployments
 * (scale them independently; a CPU-heavy thumbnail job can't slow down HTTP).
 * Here they share a process only because the user repository is in memory.
 * With Postgres you'd split this file into server.ts and worker.ts.
 */
const config = loadConfig();
const connection = connectionFromUrl(config.redisUrl);
const redis = await connectRedis(config.redisUrl);

const users = new InMemoryUserRepository();
const queues = createQueues({ connection, prefix: config.bullPrefix, names: queueNames(), settings: config.jobs });
const signupService = new SignupService(users, new BullJobProducer(queues));

const workers = startWorkers({
  connection,
  prefix: config.bullPrefix,
  names: queues.names,
  settings: config.jobs,
  concurrency: config.concurrency,
  deadLetter: queues.deadLetter,
  processors: {
    welcomeEmail: createWelcomeEmailProcessor({
      users,
      email: new ConsoleEmailSender(),
      idempotency: new RedisIdempotencyStore(redis, config.idempotencyPrefix),
    }),
    avatarThumbnail: createAvatarThumbnailProcessor({ users, thumbnailer: new FakeThumbnailer() }),
  },
});

const server = createApp({ signupService }).listen(config.port, () => {
  console.log(`signup api + workers on http://localhost:${config.port}`);
});

// Shutdown order matters: stop accepting HTTP (no new jobs enqueued), let
// workers finish their active jobs, then close queues and Redis.
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, draining...`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await workers.close();
    await queues.close();
    redis.disconnect();
    console.log("bye");
    process.exit(0);
  });
}
