# Middleware patterns

Middleware is just a function, so a few patterns cover almost everything you'll write.

## 1. Factory middleware (configurable)

Return the middleware from a function so it can take options. That's why the challenge uses `requestId()` and not `requestId`.

```ts
export function requireHeader(name: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.get(name)) return next(new HttpError(400, "MISSING_HEADER", `${name} is required`));
    next();
  };
}
app.use("/admin", requireHeader("x-admin-token"));
```

## 2. Scoped middleware

Middleware can be global (`app.use(mw)`), path-scoped (`app.use("/admin", mw)`), router-scoped (`router.use(mw)`), or per-route:

```ts
router.post("/", requireAuth, validate(createNoteSchema), createNote);
//               ^ runs in order, left to right, only for this route
```

Per-route chains are how you'll attach auth and validation later. Each function does one job.

## 3. "After" hooks with `res.on("finish")`

Middleware runs *before* the handler, so how do you measure the response? Listen for the response's `finish` event:

```ts
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({ method: req.method, path: req.originalUrl, status: res.statusCode, ms }));
  });
  next();
});
```

This is the basis of access logs and latency metrics ([module 24](../../24-observability/README.md)).

## 4. Short-circuit middleware

Respond early and *don't* call `next()`: health checks, maintenance mode, CORS preflight.

```ts
app.use((req, res, next) => {
  if (maintenanceMode) return res.status(503).json({ error: { code: "MAINTENANCE", message: "Back soon" } });
  next();
});
```

## 5. Async middleware

In Express 5, middleware can be `async`, and a rejection goes to the error handler just like it does for routes:

```ts
const loadUser: RequestHandler = async (req, res, next) => {
  res.locals.user = await users.findByToken(req.get("authorization"));
  next();
};
```

## Anti-patterns

| Anti-pattern | Why it hurts |
|---|---|
| Business logic in middleware | Hidden behavior, hard to test. Middleware is for cross-cutting concerns. |
| Calling `next()` *and* sending a response | Double response → `ERR_HTTP_HEADERS_SENT` |
| Mutating `req.body` in many places | No one knows what shape the body has by the time it reaches the handler |
| Global middleware that only one route needs | Slows every request and couples unrelated routes |
| Per-request data in module-level variables | Leaks between concurrent requests |
