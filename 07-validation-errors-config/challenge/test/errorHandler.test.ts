/**
 * TODO(6): the central error handler, driven through createApp with a fake
 * service so each error type can be produced on demand.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  DuplicateSkuError,
  InsufficientStockError,
  ProductNotFoundError,
} from "../src/domain/errors.js";
import type { ProductService } from "../src/services/productService.js";
import { memoryLogger, testConfig } from "./support/helpers.js";

function appThatThrows(err: unknown, configOverrides = {}) {
  const fail = async () => {
    throw err;
  };
  const productService = {
    list: fail,
    get: fail,
    create: fail,
    update: fail,
    reserve: fail,
    remove: fail,
  } as unknown as ProductService;
  const logger = memoryLogger();
  const app = createApp({ productService, logger, config: testConfig(configOverrides) });
  return { app, logger };
}

describe("error handler (TODO 6)", () => {
  it.each([
    ["ProductNotFoundError", new ProductNotFoundError("prd_1"), 404, "PRODUCT_NOT_FOUND"],
    ["DuplicateSkuError", new DuplicateSkuError("ABC"), 409, "DUPLICATE_SKU"],
    ["InsufficientStockError", new InsufficientStockError("prd_1", 3, 1), 422, "INSUFFICIENT_STOCK"],
  ])("maps %s by its category", async (_name, err, status, code) => {
    const { app, logger } = appThatThrows(err);
    const res = await request(app).get("/products/prd_1");
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: (err as Error).message } });
    expect(logger.calls.filter((c) => c.level === "error"), "expected errors must not be logged as errors").toEqual([]);
  });

  it("maps validation failures to 400 with field details", async () => {
    const { app } = appThatThrows(new Error("service must not be called"));
    const res = await request(app).get("/products/not-a-valid-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: expect.any(String),
      details: [{ path: "params.id", message: expect.any(String) }],
    });
  });

  it("maps malformed JSON to 400 INVALID_JSON", async () => {
    const { app } = appThatThrows(new Error("unused"));
    const res = await request(app).post("/products").set("Content-Type", "application/json").send('{"sku": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("turns unknown errors into a generic 500 without leaking details", async () => {
    const { app } = appThatThrows(new Error("ECONNREFUSED db-primary-7:5432"));
    const res = await request(app).get("/products/prd_1");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("db-primary-7");
  });

  it("logs unknown errors with logger.error, including the error and the route", async () => {
    const boom = new Error("boom");
    const { app, logger } = appThatThrows(boom);
    await request(app).get("/products/prd_1");
    const errors = logger.calls.filter((c) => c.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta).toMatchObject({ err: boom, method: "GET", path: "/products/prd_1" });
  });

  it("returns 401 UNAUTHORIZED for writes without the configured API key", async () => {
    const { app } = appThatThrows(new Error("unused"), { apiKey: "s3cret-s3cret-s3cret" });
    const res = await request(app).post("/products").send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
