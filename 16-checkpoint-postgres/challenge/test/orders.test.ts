import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  availableStock,
  createProduct,
  createWarehouse,
  placeOrder,
  setStock,
  startHarness,
  type Harness,
} from "./helpers/harness.js";

describe("orders", () => {
  let h: Harness;
  let wh: { id: number };
  let lamp: { id: number };
  let mug: { id: number };

  beforeEach(async () => {
    h = await startHarness();
    wh = await createWarehouse(h);
    lamp = await createProduct(h, { name: "Lamp", priceCents: 2500 });
    mug = await createProduct(h, { name: "Mug", priceCents: 800 });
    await setStock(h, wh.id, lamp.id, 5);
    await setStock(h, wh.id, mug.id, 10);
  });
  afterEach(async () => {
    await h.close();
  });

  it("places an order: reserves stock for every line and prices it from the catalog", async () => {
    const res = await placeOrder(h, wh.id, [
      { productId: lamp.id, quantity: 2 },
      { productId: mug.id, quantity: 3 },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers.location).toBe(`/orders/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      customerId: "cust-1",
      warehouseId: wh.id,
      status: "reserved",
      totalCents: 2 * 2500 + 3 * 800,
    });
    expect(res.body.data.createdAt).toEqual(expect.any(String));
    expect(res.body.data.lines).toEqual(
      expect.arrayContaining([
        { productId: lamp.id, quantity: 2, unitPriceCents: 2500 },
        { productId: mug.id, quantity: 3, unitPriceCents: 800 },
      ]),
    );
    expect(await availableStock(h, wh.id, lamp.id)).toBe(3);
    expect(await availableStock(h, wh.id, mug.id)).toBe(7);

    const got = await h.api().get(`/orders/${res.body.data.id}`);
    expect(got.status).toBe(200);
    expect(got.body.data).toEqual(res.body.data);
  });

  it("is all-or-nothing: one short line rejects the whole order with 409 INSUFFICIENT_STOCK", async () => {
    const res = await placeOrder(h, wh.id, [
      { productId: mug.id, quantity: 4 },
      { productId: lamp.id, quantity: 6 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(res.body.error.details).toEqual([{ productId: lamp.id }]);
    expect(await availableStock(h, wh.id, mug.id), "mug reservation must be rolled back").toBe(10);
    expect(await availableStock(h, wh.id, lamp.id)).toBe(5);
    const [row] = await h.sql<{ n: number }>("SELECT count(*)::int AS n FROM orders");
    expect(row!.n, "no order row may survive").toBe(0);
  });

  it("treats a product with no stock row in that warehouse as out of stock", async () => {
    const other = await createWarehouse(h);
    const res = await placeOrder(h, other.id, [{ productId: lamp.id, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("404s unknown warehouses and products", async () => {
    const r1 = await placeOrder(h, 999999, [{ productId: lamp.id, quantity: 1 }]);
    expect(r1.status).toBe(404);
    const r2 = await placeOrder(h, wh.id, [{ productId: 999999, quantity: 1 }]);
    expect(r2.status).toBe(404);
    expect(r2.body.error.code).toBe("NOT_FOUND");
    expect((await h.api().get("/orders/999999")).status).toBe(404);
  });

  it.each([
    ["no lines", { customerId: "c", lines: [] }],
    ["zero quantity", { customerId: "c", lines: [{ productId: 1, quantity: 0 }] }],
    ["duplicate product lines", { customerId: "c", lines: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] }],
    ["missing customerId", { lines: [{ productId: 1, quantity: 1 }] }],
  ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
    const res = await h.api().post("/orders").send({ warehouseId: wh.id, ...body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cancelling releases the reserved stock", async () => {
    const order = await placeOrder(h, wh.id, [
      { productId: lamp.id, quantity: 2 },
      { productId: mug.id, quantity: 1 },
    ]);
    const res = await h.api().post(`/orders/${order.body.data.id}/cancel`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe("cancelled");
    expect(await availableStock(h, wh.id, lamp.id)).toBe(5);
    expect(await availableStock(h, wh.id, mug.id)).toBe(10);
  });

  it("cancelling twice is 409 ORDER_NOT_CANCELLABLE and doesn't release stock again", async () => {
    const order = await placeOrder(h, wh.id, [{ productId: lamp.id, quantity: 2 }]);
    await h.api().post(`/orders/${order.body.data.id}/cancel`);
    const again = await h.api().post(`/orders/${order.body.data.id}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ORDER_NOT_CANCELLABLE");
    expect(await availableStock(h, wh.id, lamp.id)).toBe(5);
    expect((await h.api().post("/orders/999999/cancel")).status).toBe(404);
  });

  it("keeps the price paid even if the catalog price changes later", async () => {
    const order = await placeOrder(h, wh.id, [{ productId: mug.id, quantity: 1 }]);
    await h.sql("UPDATE products SET price_cents = 9999 WHERE id = $1", [mug.id]);
    const got = await h.api().get(`/orders/${order.body.data.id}`);
    expect(got.body.data.totalCents).toBe(800);
    expect(got.body.data.lines[0].unitPriceCents).toBe(800);
  });
});
