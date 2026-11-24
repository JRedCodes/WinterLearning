# Express 5 cheat sheet

```ts
import express, { Router, type RequestHandler, type ErrorRequestHandler } from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));     // parse JSON bodies → req.body
app.use(express.urlencoded({ extended: false })); // HTML form bodies

// routes
app.get("/items", handler);
app.post("/items", handler);
app.route("/items/:id").get(h).patch(h).delete(h);
app.use("/items", itemsRouter);                // mount a Router at a prefix
app.all("/legacy/*splat", h);                  // Express 5 wildcard syntax needs a name

// request
req.params.id            // string
req.query.q              // string | string[] | ParsedQs | undefined
req.body                 // unknown-ish (any) — validate it!
req.get("x-request-id")  // header (case-insensitive)
req.method, req.path, req.originalUrl, req.ip

// response
res.status(201).json({ data });
res.location("/items/1");
res.set("Cache-Control", "no-store");
res.status(204).end();
res.redirect(302, "/elsewhere");
res.locals.anything = 1;  // per-request scratch space
res.headersSent           // true once headers are written

// middleware
const mw: RequestHandler = (req, res, next) => { next(); };
const errMw: ErrorRequestHandler = (err, req, res, next) => { res.status(500).json({}); };
app.use(errMw);           // error handlers LAST, 4 params

// testing
import request from "supertest";
await request(app).post("/items").send({ name: "x" }).expect(201);
```

### Express 4 → 5 gotchas
- Async handler rejections are forwarded to error handlers automatically.
- Path syntax: `/*` becomes `/*splat`, and optional params look like `/:file{.:ext}`.
- `req.query` is read-only (a getter).
- `res.status()` only accepts valid integer status codes.
- `app.del()` is gone, use `app.delete()`.
