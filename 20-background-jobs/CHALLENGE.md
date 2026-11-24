# Challenge · Signup Jobs That Survive Reality

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** Redis

## Scenario

> **#growth-eng** · *Jonas (PM):* Signup is slow (p95 3.1s) and when the email provider had its outage last week, signups *failed*. We lost real users.
>
> *Priya (tech lead):* I moved the email and avatar thumbnail work onto BullMQ queues: the API now returns in ~10ms and workers do the rest. Everything runs, but it's not production-ready. Some users got **two** welcome emails, jobs that fail just disappear after one try, we can't see what failed for good, and after every deploy ops sees stalled jobs. The TODOs are in `src/jobs/`. Tests are the contract.

## Your task

The app works end to end (`make dev`, then sign up), but these pieces are missing or naive. Work through the numbered `TODO(n)` comments:

| TODO | File | What |
|---|---|---|
| 1 | `src/jobs/backoff.ts` | `computeBackoff`: exponential backoff with full jitter |
| 2 | `src/jobs/queues.ts` | `defaultJobOptions`: attempts, custom backoff, bounded history |
| 3 | `src/jobs/producer.ts` | Deterministic `jobId`s so duplicate enqueues collapse into one job |
| 4 | `src/jobs/idempotency.ts` | `RedisIdempotencyStore`: atomic claim / complete / release |
| 5 | `src/jobs/processors/welcomeEmail.ts` | Make the email processor idempotent; missing user is unrecoverable |
| 6 | `src/jobs/processors/avatarThumbnail.ts` | Classify errors: bad input → `UnrecoverableError` |
| 7 | `src/jobs/deadLetter.ts` | `isFinalAttempt` + `withDeadLetter` wrapper → dead-letter queue |
| 8 | `src/jobs/workers.ts` | Graceful shutdown |

Read `src/server.ts` first: it's the composition root and shows how all the pieces connect. `src/jobs/types.ts` has the payload and settings types.

## Acceptance criteria

- [ ] **Backoff:** ceiling doubles per attempt from `baseMs`, capped at `maxMs`; delay is `floor(random() × ceiling)`; integer ms (`test/backoff.test.ts`)
- [ ] **Job defaults:** `attempts` from settings, `backoff: { type: "custom" }`, bounded `removeOnComplete` / `removeOnFail` objects (`test/queues.test.ts`)
- [ ] **Idempotency store:** one winner among concurrent claims; `done` after complete; release frees in-progress but never erases `done`; leases expire; every key has a TTL (`test/idempotency.test.ts`)
- [ ] **Email processor:** sends once per user no matter how many times it runs (sequentially or concurrently); a failed send can be retried; stable provider idempotency key; missing user → `UnrecoverableError` (`test/processors.test.ts`)
- [ ] **Thumbnail processor:** non-http(s) URL or missing user → `UnrecoverableError` without calling the thumbnailer; thumbnailer errors stay retryable (`test/processors.test.ts`)
- [ ] **Dead letters:** only the final failure (or an unrecoverable one) is dead-lettered, with original queue/id/name/data/reason/attempts/time and a deterministic DLQ job id; the original error is always rethrown (`test/deadLetter.test.ts`)
- [ ] **End to end** on real BullMQ (`test/system.test.ts`): flaky provider succeeds after retries without a dead letter; permanently failing job ends in the DLQ after all attempts; bad avatar URL is dead-lettered after 1 attempt; double enqueue = one job, one email; `workers.close()` waits for the active job to complete
- [ ] `npm test` and `npm run typecheck` pass

## Getting started

```bash
cd 20-background-jobs/challenge
make install
make up          # Redis on localhost:6380 (this module uses DB 4, keys wl:20*)
make test        # some tests time out at 5s until retries work. That's expected.
make dev         # API + workers in one process
```

Try it:

```bash
curl -s localhost:3000/signup -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","avatarUrl":"https://img.example.com/ada.png"}'
# watch the worker logs, then:
curl -s localhost:3000/users/<id>
make redis-cli    # SCAN 0 MATCH wl:20:* · LRANGE wl:20:app-dead-letter:wait 0 -1
```

Run one file while you work: `npx vitest backoff`, `npx vitest idempotency`...

## Rules

- Don't modify the tests or `src/jobs/types.ts`.
- Keep the layering: `SignupService` must not import BullMQ. It only knows the `JobProducer` port.
- Idempotency must be **atomic** (no `GET`-then-`SET`).
- No extra dependencies.

## Stretch goals

1. Write `scripts/replayDeadLetters.ts` that moves every dead letter back to its original queue (new job id, fresh attempts).
2. Add a `GET /jobs/:queue/:id` endpoint returning a job's state, progress and failure reason (keep BullMQ out of the controller: add a port).
3. Honor `Retry-After` from a provider: make the email sender throw a `RateLimitedError(retryAfterMs)` and have your `backoffStrategy` use it.
4. Add the worker `limiter` option so the email queue never exceeds 10 jobs/second across all workers, and explain why that's better than each worker sleeping.
5. Store a unique token in the idempotency claim so `release()` only deletes *your own* claim (read the "Why compare-and-delete" section in [docs/delivery-guarantees-and-idempotency.md](docs/delivery-guarantees-and-idempotency.md)).
6. Split `server.ts` into `api.ts` and `worker.ts` entry points, and write down what you'd need to change (hint: the in-memory repository).

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/20-background-jobs`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- 20` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 20-background-jobs/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
