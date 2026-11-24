# api/

The ticketing API and worker. One npm package lives at `challenge/` (so `npm test`
there runs everything); this folder holds the source.

```
api/
├── migrations/        SQL migrations, applied in filename order (001_init.sql is yours to write)
├── src/
│   ├── config.ts      ✅ given: the only reader of process.env
│   ├── container.ts   ✏️ the composition contract the tests use (buildContainer)
│   ├── app.ts         ✏️ createApp(container): the Express app, no listen()
│   ├── server.ts      ✅ given: API process composition root
│   ├── worker.ts      ✏️ M4: worker process composition root (you create it)
│   ├── lib/clock.ts   ✅ given: injected clock
│   ├── messaging/eventPublisher.ts    ✅ given: EventPublisher port + event types
│   ├── notifications/emailSender.ts   ✅ given: EmailSender port
│   └── db/            ✅ given: pool + migration runner
├── test/              ✅ given: acceptance tests (don't edit), helpers and fakes
└── Dockerfile         ✏️ M6 (you create it)
```

Everything marked ✏️ is yours to design. `docs/architecture.md` (module root)
shows one clean layout; you don't have to copy it.

Commands (run from `challenge/`):

```bash
make up            # postgres, redis, kafka
npm test           # all acceptance tests
npx vitest run api/test/m2   # only the M2 files
npm run dev        # API on :3000
npm run worker     # outbox relay, sweeper, notifications (M4)
```
