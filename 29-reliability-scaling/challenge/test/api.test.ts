import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { ProductOverviewService } from "../src/services/productOverviewService.js";
import { fakeDownstreams, testPolicies } from "./helpers/fakes.js";

/** HTTP-level behavior, real timers, small timeouts. */
function setup() {
  const fakes = fakeDownstreams();
  const policies = testPolicies();
  for (const p of Object.values(policies)) {
    p.timeoutMs = 40;
    p.retry = { attempts: 2, baseDelayMs: 5, maxDelayMs: 5 };
  }
  const overview = new ProductOverviewService({ downstreams: fakes.downstreams, policies });
  return { ...fakes, app: createApp({ overview }) };
}

describe("GET /products/:id/overview (TODO 6, over HTTP)", () => {
  it("200 with data, degraded: false when all downstreams are healthy", async () => {
    const { app } = setup();
    const res = await request(app).get("/products/p-1/overview");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        product: { id: "p-1", name: "Product p-1", description: "desc" },
        price: { amount: 1999, currency: "EUR", stale: false },
        reviews: { average: 4.5, count: 10 },
      },
      degraded: false,
      unavailable: [],
    });
  });

  it("200 with a partial response and degraded: true when an optional downstream hangs", async () => {
    const { app, reviews } = setup();
    reviews.behavior = "hang";
    const started = Date.now();
    const res = await request(app).get("/products/p-1/overview");
    expect(Date.now() - started, "the request must not hang with its slowest dependency").toBeLessThan(1_000);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ degraded: true, unavailable: ["reviews"], data: { reviews: null } });
  }, 3_000);

  it("404 PRODUCT_NOT_FOUND when the catalog says so", async () => {
    const { app, catalog } = setup();
    catalog.behavior = "notfound";
    const res = await request(app).get("/products/p-404/overview");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("503 UPSTREAM_UNAVAILABLE with Retry-After when the catalog is down", async () => {
    const { app, catalog } = setup();
    catalog.behavior = "fail";
    const res = await request(app).get("/products/p-1/overview");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
  }, 3_000);

  it("400 for an invalid product id", async () => {
    const { app } = setup();
    const res = await request(app).get("/products/bad%20id!/overview");
    expect(res.status).toBe(400);
  });

  it("GET /health/dependencies reports breaker states", async () => {
    const { app, reviews } = setup();
    expect((await request(app).get("/health/dependencies")).body).toEqual({
      breakers: { catalog: "closed", pricing: "closed", reviews: "closed" },
    });
    reviews.behavior = "fail";
    for (let i = 0; i < 3; i++) await request(app).get("/products/p-1/overview");
    expect((await request(app).get("/health/dependencies")).body.breakers.reviews).toBe("open");
  }, 3_000);

  it("GET /health stays 200 even when downstreams are failing (liveness ≠ dependency health)", async () => {
    const { app, catalog, pricing, reviews } = setup();
    catalog.behavior = pricing.behavior = reviews.behavior = "fail";
    await request(app).get("/products/p-1/overview");
    expect((await request(app).get("/health")).status).toBe(200);
  }, 3_000);
});
