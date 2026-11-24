import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProduct, createWarehouse, setStock, startHarness, type Harness } from "./helpers/harness.js";

describe("products, warehouses & stock", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it("GET /health", async () => {
    expect((await h.api().get("/health")).status).toBe(200);
  });

  it("creates a product (201 + Location) and normalizes the SKU to upper case", async () => {
    const res = await h.api().post("/products").send({ sku: " lamp-01 ", name: "Desk Lamp", priceCents: 2999 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ sku: "LAMP-01", name: "Desk Lamp", priceCents: 2999, description: null });
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.headers.location).toBe(`/products/${res.body.data.id}`);
  });

  it("rejects a duplicate SKU (case-insensitive) with 409 DUPLICATE_SKU", async () => {
    await createProduct(h, { sku: "MUG-1" });
    const res = await h.api().post("/products").send({ sku: "mug-1", name: "Another mug", priceCents: 500 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_SKU");
  });

  it.each([
    ["missing name", { sku: "OK-1", priceCents: 1 }],
    ["negative price", { sku: "OK-1", name: "x", priceCents: -1 }],
    ["fractional price", { sku: "OK-1", name: "x", priceCents: 1.5 }],
    ["bad sku characters", { sku: "no spaces!", name: "x", priceCents: 1 }],
  ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
    const res = await h.api().post("/products").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 INVALID_JSON for malformed bodies and 404 ROUTE_NOT_FOUND for unknown routes", async () => {
    const bad = await h.api().post("/products").set("content-type", "application/json").send('{"sku":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_JSON");
    const nope = await h.api().get("/nope");
    expect(nope.status).toBe(404);
    expect(nope.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("creates warehouses and rejects duplicate codes with 409 DUPLICATE_WAREHOUSE", async () => {
    const res = await h.api().post("/warehouses").send({ code: "BER-1", name: "Berlin" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: "BER-1", name: "Berlin" });
    const dup = await h.api().post("/warehouses").send({ code: "BER-1", name: "Berlin again" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_WAREHOUSE");
  });

  it("sets stock per warehouse and shows it on GET /products/:id", async () => {
    const p = await createProduct(h);
    const w1 = await createWarehouse(h);
    const w2 = await createWarehouse(h);

    const put = await h.api().put(`/warehouses/${w2.id}/stock/${p.id}`).send({ available: 7 });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.data).toEqual({ warehouseId: w2.id, productId: p.id, available: 7 });
    await setStock(h, w1.id, p.id, 3);
    await setStock(h, w1.id, p.id, 5); // overwrite, not add

    const res = await h.api().get(`/products/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: p.id, sku: p.sku, totalAvailable: 12 });
    expect(res.body.data.stock).toEqual([
      { warehouseId: w1.id, available: 5 },
      { warehouseId: w2.id, available: 7 },
    ]);
  });

  it("validates stock updates and 404s unknown products/warehouses", async () => {
    const p = await createProduct(h);
    const w = await createWarehouse(h);
    expect((await h.api().put(`/warehouses/${w.id}/stock/${p.id}`).send({ available: -1 })).status).toBe(400);
    expect((await h.api().put(`/warehouses/999999/stock/${p.id}`).send({ available: 1 })).status).toBe(404);
    expect((await h.api().put(`/warehouses/${w.id}/stock/999999`).send({ available: 1 })).status).toBe(404);
    const missing = await h.api().get("/products/999999");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await h.api().get("/products/abc")).status).toBe(400);
  });

  describe("GET /products search", () => {
    beforeEach(async () => {
      for (const name of ["Desk Lamp", "LAMPSHADE large", "Floor lamp", "Coffee Mug", "100% Cotton Tee", "Lantern"]) {
        await createProduct(h, { name });
      }
    });

    it("finds products whose name contains q, case-insensitively, ordered by name", async () => {
      const res = await h.api().get("/products").query({ q: "lamp" });
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(["Desk Lamp", "Floor lamp", "LAMPSHADE large"]);
    });

    it("treats % and _ in q literally", async () => {
      const pct = await h.api().get("/products").query({ q: "%" });
      expect(pct.body.data.map((p: { name: string }) => p.name)).toEqual(["100% Cotton Tee"]);
      const underscore = await h.api().get("/products").query({ q: "_" });
      expect(underscore.body.data).toEqual([]);
    });

    it("lists everything by name without q, honoring limit (1-100, default 20)", async () => {
      const all = await h.api().get("/products");
      expect(all.body.data).toHaveLength(6);
      expect(all.body.data[0].name).toBe("100% Cotton Tee");
      const two = await h.api().get("/products").query({ limit: 2 });
      expect(two.body.data).toHaveLength(2);
      expect((await h.api().get("/products").query({ limit: 0 })).status).toBe(400);
      expect((await h.api().get("/products").query({ limit: 101 })).status).toBe(400);
    });
  });
});
