# Layered Express project: cheat sheet

A compact reference for the patterns from modules 05–09, in one place.

## Folder map

| Folder / file | Owns | Must not |
|---|---|---|
| `config.ts` | parsing env with zod, typed `Config` | be imported by services for env access |
| `server.ts` | composition root: config, real deps, `listen`, shutdown | contain logic |
| `app.ts` | `createApp(deps)`: wiring + middleware order | `listen()`, read `process.env` |
| `routes/` | path → handler mapping, route-level middleware | contain logic |
| `controllers/` | parse input (zod), call service, map to DTO, status codes | contain business rules |
| `services/` | business rules, orchestration, throwing domain errors | import express, know status codes |
| `repositories/` | interface + implementations for storage | enforce business rules |
| `domain/` | entities, error codes, pure functions | do I/O |
| `middleware/` | requestId, auth, notFound, errorHandler | contain business rules |

## Skeletons

```ts
// app.ts
export function createApp(deps: AppDeps): Express {
  const service = new ThingService({ repo: deps.repo ?? new InMemoryThingRepository(), clock: deps.clock });
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId());
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
  app.use("/things", thingRoutes(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

```ts
// controllers/thingsController.ts
export function thingsController(things: ThingService) {
  return {
    async create(req: Request, res: Response) {
      const input = parse(createThingBody, req.body);          // 400 with details on failure
      const thing = await things.create(currentUserId(res), input);
      res.status(201).location(`/things/${thing.id}`).json({ data: toDto(thing) });
    },
  };
}
```

```ts
// services/thingService.ts
export class ThingService {
  constructor(private readonly deps: { repo: ThingRepository; clock: Clock; newId: () => string }) {}
  async get(userId: string, id: string): Promise<Thing> {
    const thing = await this.deps.repo.findById(id);
    if (!thing || thing.userId !== userId) throw new DomainError("THING_NOT_FOUND", "Thing not found");
    return thing;
  }
}
```

```ts
// domain/errors.ts
export type DomainErrorCode = "THING_NOT_FOUND" | "THING_NAME_TAKEN";
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string) { super(message); }
}

// middleware/errorHandler.ts
const STATUS_BY_CODE = { THING_NOT_FOUND: 404, THING_NAME_TAKEN: 409 } satisfies Record<DomainErrorCode, number>;
```

```ts
// config.ts
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = envSchema.safeParse(env);
  if (!r.success) throw new Error(`Invalid configuration:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return { port: r.data.PORT, nodeEnv: r.data.NODE_ENV };
}
```

## Error format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request is invalid", "requestId": "3f2a...", "details": [{ "path": "name", "message": "name must not be empty" }] } }
```

| Situation | Status | Code |
|---|---|---|
| zod validation failed | 400 | `VALIDATION_ERROR` (+ `details`) |
| bad JSON | 400 | `INVALID_JSON` |
| no/invalid identity | 401 | `UNAUTHENTICATED` |
| not found / not yours | 404 | `<THING>_NOT_FOUND` |
| unknown route | 404 | `ROUTE_NOT_FOUND` |
| uniqueness conflict | 409 | `<THING>_..._TAKEN` |
| valid input, rule violated | 422 | e.g. `FUTURE_DATE` |
| bug / outage | 500 | `INTERNAL_ERROR` (generic message, logged) |

## Status codes for writes

| Operation | Success |
|---|---|
| `POST` create | `201` + `Location` + body |
| `PUT` idempotent upsert | `201` if created, `200` if it already existed |
| `PATCH` | `200` + updated body |
| `DELETE` | `204`, no body |

## Middleware order

`requestId` → `express.json` → public routes → routers (each starting with `authenticate`) → `notFound` → `errorHandler`.
