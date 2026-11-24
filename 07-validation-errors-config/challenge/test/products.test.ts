/** The whole API end to end: schemas + validate + service + error handler together. */
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, validProduct } from "./support/helpers.js";

type App = ReturnType<typeof buildApp>["app"];

async function create(app: App, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/products").send(validProduct(overrides));
  expect(res.status, `POST /products failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; sku: string; stock: number };
}

describe("product catalog API", () => {
  let app: App;
  beforeEach(() => {
    app = buildApp().app;
  });

  it("GET /health", async () => {
    await request(app).get("/health").expect(200, { status: "ok" });
  });

  describe("POST /products", () => {
    it("creates a product with normalized fields and a Location header", async () => {
      const res = await request(app)
        .post("/products")
        .send(validProduct({ sku: " tshirt-red-m ", category: "Apparel", tags: [" summer "] }));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        sku: "TSHIRT-RED-M",
        name: "Red T-shirt (M)",
        category: "apparel",
        priceCents: 1999,
        stock: 10,
        tags: ["summer"],
      });
      expect(res.headers.location).toBe(`/products/${res.body.data.id}`);
    });

    it("returns 400 with a details entry per invalid field", async () => {
      const res = await request(app).post("/products").send({ sku: "x", name: "", priceCents: "12" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      const got = (res.body.error.details as { path: string }[]).map((d) => d.path).sort();
      expect(got).toEqual(["body.category", "body.name", "body.priceCents", "body.sku"]);
    });

    it("ignores fields clients must not set", async () => {
      const res = await request(app).post("/products").send(validProduct({ id: "prd_mine", createdAt: "1999-01-01" }));
      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe("prd_mine");
      expect(res.body.data.createdAt).not.toBe("1999-01-01");
    });

    it("rejects a duplicate SKU (case-insensitively) with 409 DUPLICATE_SKU", async () => {
      await create(app, { sku: "MUG-01" });
      const res = await request(app).post("/products").send(validProduct({ sku: "mug-01" }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DUPLICATE_SKU");
    });
  });

  describe("GET /products", () => {
    it("paginates with coerced query params and reports the total", async () => {
      for (let i = 1; i <= 5; i++) await create(app, { sku: `SKU-${i}` });
      const res = await request(app).get("/products?page=2&limit=2");
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { sku: string }) => p.sku)).toEqual(["SKU-3", "SKU-4"]);
      expect(res.body.page).toEqual({ page: 2, limit: 2, total: 5 });
    });

    it("filters by category, price range and stock", async () => {
      await create(app, { sku: "A-1", category: "kitchen", priceCents: 500, stock: 0 });
      await create(app, { sku: "A-2", category: "kitchen", priceCents: 1500, stock: 3 });
      await create(app, { sku: "A-3", category: "garden", priceCents: 1500, stock: 3 });
      const res = await request(app).get("/products?category=Kitchen&minPriceCents=1000&inStock=true");
      expect(res.body.data.map((p: { sku: string }) => p.sku)).toEqual(["A-2"]);
      const outOfStock = await request(app).get("/products?inStock=false");
      expect(outOfStock.body.data.map((p: { sku: string }) => p.sku)).toEqual(["A-1"]);
    });

    it("uses the configured page size defaults", async () => {
      const small = buildApp({ pagination: { defaultLimit: 2, maxLimit: 3 } }).app;
      for (let i = 1; i <= 4; i++) await create(small, { sku: `SKU-${i}` });
      const res = await request(small).get("/products");
      expect(res.body.page).toEqual({ page: 1, limit: 2, total: 4 });
      const tooBig = await request(small).get("/products?limit=4");
      expect(tooBig.status).toBe(400);
      expect(tooBig.body.error.details[0].path).toBe("query.limit");
    });

    it.each(["page=0", "limit=abc", "minPriceCents=900&maxPriceCents=100", "inStock=yes-please"])(
      "rejects ?%s with 400",
      async (qs) => {
        const res = await request(app).get(`/products?${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      },
    );
  });

  describe("single product", () => {
    it("GET /products/:id returns the product or 404 PRODUCT_NOT_FOUND", async () => {
      const p = await create(app);
      await request(app).get(`/products/${p.id}`).expect(200);
      const res = await request(app).get("/products/prd_missing");
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: "PRODUCT_NOT_FOUND", message: "Product prd_missing not found" });
    });

    it("PATCH updates allowed fields and ignores sku/stock", async () => {
      const p = await create(app, { stock: 10 });
      const res = await request(app).patch(`/products/${p.id}`).send({ priceCents: 2500, sku: "HACK", stock: 999 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ priceCents: 2500, sku: p.sku, stock: 10 });
    });

    it("PATCH with an empty body is a 400", async () => {
      const p = await create(app);
      const res = await request(app).patch(`/products/${p.id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ path: "body", message: "provide at least one field to update" }]);
    });

    it("reserve decrements stock, and over-reserving is a 422 that changes nothing", async () => {
      const p = await create(app, { stock: 3 });
      const ok = await request(app).post(`/products/${p.id}/reserve`).send({ quantity: 2 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.stock).toBe(1);

      const tooMany = await request(app).post(`/products/${p.id}/reserve`).send({ quantity: 2 });
      expect(tooMany.status).toBe(422);
      expect(tooMany.body.error).toEqual({
        code: "INSUFFICIENT_STOCK",
        message: "Only 1 in stock, cannot reserve 2",
      });
      const after = await request(app).get(`/products/${p.id}`);
      expect(after.body.data.stock).toBe(1);
    });

    it("DELETE returns 204, then 404", async () => {
      const p = await create(app);
      const del = await request(app).delete(`/products/${p.id}`);
      expect(del.status).toBe(204);
      expect(del.text).toBe("");
      await request(app).delete(`/products/${p.id}`).expect(404);
    });
  });

  it("unknown routes return 404 ROUTE_NOT_FOUND", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
