/** TODO(3): the validate() middleware factory, tested on a tiny standalone app. */
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "../src/middleware/validate.js";
import { ValidationError } from "../src/domain/errors.js";

function testApp() {
  const app = express();
  app.use(express.json());
  app.post(
    "/things/:id",
    validate({
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      body: z.object({ name: z.string().trim().min(1), size: z.number().int().optional() }),
    }),
    (req, res) => {
      res.json({ validated: res.locals.validated, rawBody: req.body });
    },
  );
  app.get("/only-query", validate({ query: z.object({ q: z.string().optional() }) }), (_req, res) => {
    res.json({ validated: res.locals.validated });
  });
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      isValidationError: err instanceof ValidationError,
      details: err?.details,
    });
  };
  app.use(onError);
  return app;
}

describe("validate({ body, query, params }) (TODO 3)", () => {
  it("stores the PARSED values (coercions, defaults, transforms) on res.locals.validated", async () => {
    const res = await request(testApp()).post("/things/42?page=3").send({ name: "  lamp ", extra: true });
    expect(res.status).toBe(200);
    expect(res.body.validated).toEqual({
      params: { id: "42" },
      query: { page: 3 },
      body: { name: "lamp" },
    });
  });

  it("applies defaults for missing optional values", async () => {
    const res = await request(testApp()).post("/things/1").send({ name: "x" });
    expect(res.body.validated.query).toEqual({ page: 1 });
  });

  it("leaves the raw request body untouched", async () => {
    const res = await request(testApp()).post("/things/1").send({ name: "  lamp " });
    expect(res.body.rawBody).toEqual({ name: "  lamp " });
  });

  it("only validates the parts it was given", async () => {
    const res = await request(testApp()).get("/only-query?q=hi");
    expect(res.status).toBe(200);
    expect(res.body.validated).toEqual({ query: { q: "hi" } });
  });

  it("forwards a ValidationError with details prefixed by request part", async () => {
    const res = await request(testApp()).post("/things/1").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.isValidationError).toBe(true);
    expect(res.body.details).toEqual([{ path: "body.name", message: expect.any(String) }]);
  });

  it("collects issues from ALL parts instead of stopping at the first", async () => {
    const res = await request(testApp()).post("/things/abc?page=0").send({ size: 1.5 });
    expect(res.status).toBe(400);
    const got = (res.body.details as { path: string }[]).map((d) => d.path).sort();
    expect(got).toEqual(["body.name", "body.size", "params.id", "query.page"]);
  });

  it("joins nested paths with dots and uses the bare part name for whole-object issues", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/nested",
      validate({
        body: z
          .object({ items: z.array(z.object({ qty: z.number().min(1) })) })
          .refine((b) => b.items.length > 0, { message: "add at least one item" }),
      }),
      (_req, res) => res.json({}),
    );
    app.use(((err, _req, res, _next) => res.status(400).json({ details: err.details })) as ErrorRequestHandler);

    const bad = await request(app).post("/nested").send({ items: [{ qty: 1 }, { qty: 0 }] });
    expect(bad.body.details).toEqual([{ path: "body.items.1.qty", message: expect.any(String) }]);

    const whole = await request(app).post("/nested").send({ items: [] });
    expect(whole.body.details).toEqual([{ path: "body", message: "add at least one item" }]);
  });
});
