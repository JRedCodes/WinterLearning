# BullMQ cheat sheet

```ts
import { Queue, Worker, QueueEvents, UnrecoverableError, type Job } from "bullmq";

const connection = { host: "localhost", port: 6380, db: 4 };   // options, not a client
const prefix = "wl:20";                                          // key namespace (default "bull")
```

## Producing

```ts
const q = new Queue<{ userId: string }>("emails", {
  connection, prefix,
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000, jitter: 0.5 },
                       removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } },
});

await q.add("welcome-email", { userId }, {
  jobId: `welcome-email-${userId}`,  // dedupe while the job exists (no ":" in ids)
  delay: 60_000,                     // run in 1 min
  priority: 1,                       // 1 = highest
  attempts: 3,                       // overrides default
});
await q.addBulk([{ name, data, opts }, ...]);

// cron / repeat (one job per tick, no matter how many workers)
await q.upsertJobScheduler("nightly-report", { pattern: "0 3 * * *" }, { name: "report", data: {} });
await q.upsertJobScheduler("heartbeat", { every: 60_000 });
```

## Consuming

```ts
const worker = new Worker<{ userId: string }>("emails", async (job) => {
  await job.updateProgress(50);
  if (bad) throw new UnrecoverableError("no point retrying");   // straight to failed
  return { ok: true };                                          // → job.returnvalue
}, {
  connection, prefix,
  concurrency: 10,                         // parallel jobs in this worker
  limiter: { max: 100, duration: 1000 },   // ≤ 100 jobs/s across ALL workers of the queue
  settings: { backoffStrategy: (attemptsMade, type, err, job) => 1000 * 2 ** attemptsMade },
  // with job opts backoff: { type: "custom" }
});

worker.on("completed", (job, result) => {});
worker.on("failed", (job, err) => {});    // every failed attempt; final if job.attemptsMade >= job.opts.attempts
worker.on("error", (err) => {});          // ALWAYS attach, or connection errors are unhandled
await worker.waitUntilReady();
await worker.close();                     // graceful: waits for active jobs
await worker.close(true);                 // force: doesn't wait (last resort)
```

Inside a processor, `job.attemptsMade` = attempts *before* this one (0 on the first run).

## Inspecting

```ts
await q.getJobCounts();                         // { waiting, active, completed, failed, delayed, ... }
await q.getJobs(["failed"], 0, 49);
const job = await q.getJob(id);
await job?.getState();                          // "waiting" | "active" | "completed" | "failed" | "delayed" ...
job?.failedReason; job?.returnvalue; job?.attemptsMade; job?.progress;
await job?.retry();                             // re-run a failed job
await job?.remove();
```

## Global events (any process)

```ts
const events = new QueueEvents("emails", { connection, prefix });
events.on("completed", ({ jobId, returnvalue }) => {});
events.on("failed", ({ jobId, failedReason }) => {});
events.on("progress", ({ jobId, data }) => {});
await job.waitUntilFinished(events, 10_000);   // handy in scripts/tests
```

## Housekeeping

```ts
await q.pause(); await q.resume();
await q.drain();                    // remove waiting/delayed jobs
await q.clean(3600_000, 1000, "completed");
await q.obliterate({ force: true }); // delete the whole queue (tests!)
await q.close();
```

## Redis view

```
redis-cli -p 6380 -n 4
SCAN 0 MATCH wl:20:* COUNT 100
LRANGE wl:20:app-emails:wait 0 -1        # waiting job ids
ZRANGE wl:20:app-emails:delayed 0 -1 WITHSCORES
HGETALL wl:20:app-emails:welcome-email-<userId>
```

## Production checklist

- [ ] `maxmemory-policy noeviction` + AOF on the queue Redis
- [ ] Every processor idempotent; job data = ids, not objects
- [ ] attempts + backoff with jitter; `UnrecoverableError` for permanent failures
- [ ] DLQ + alert + replay script
- [ ] `removeOnComplete` / `removeOnFail` bounded
- [ ] `worker.on("error")` attached; graceful `close()` on SIGTERM; grace period > longest job
- [ ] Metrics: waiting count, oldest job age, failure rate, DLQ size
